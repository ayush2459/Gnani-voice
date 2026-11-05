import hmac
import hashlib
import uuid
from typing import List
from uuid import UUID

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/store", tags=["Commerce checkout"])

class CartLine(BaseModel):
    product_id: str = Field(min_length=1, max_length=80)
    quantity: int = Field(ge=1, le=10)

class CheckoutIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=160)
    customer_email: EmailStr
    customer_session: str = Field(min_length=8, max_length=128)
    items: List[CartLine] = Field(min_length=1, max_length=20)

class VerifyIn(BaseModel):
    order_id: UUID
    customer_session: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

def _razorpay():
    if settings.RAZORPAY_MODE != "test":
        raise HTTPException(503, "Only Razorpay Test Mode is enabled for this demo.")
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(503, "Razorpay test keys are not configured. Add them to backend/.env.")
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

@router.get("/products")
def products(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT id,name,description,price_paise,stock_quantity,image_url FROM commerce_products WHERE active=TRUE ORDER BY name")).mappings().all()
    return [dict(r) for r in rows]

@router.post("/checkout/order", status_code=201)
def create_checkout(payload: CheckoutIn, db: Session = Depends(get_db)):
    client = _razorpay()
    quantities = {}
    for line in payload.items:
        quantities[line.product_id] = quantities.get(line.product_id, 0) + line.quantity
    rows = db.execute(text("""
        SELECT id,name,price_paise,stock_quantity FROM commerce_products
        WHERE id = ANY(:ids) AND active=TRUE
    """), {"ids": list(quantities)}).mappings().all()
    catalog = {r["id"]: dict(r) for r in rows}
    if set(quantities) != set(catalog):
        raise HTTPException(404, "One or more products are unavailable.")
    for pid, qty in quantities.items():
        if catalog[pid]["stock_quantity"] < qty:
            raise HTTPException(409, f"Insufficient stock for {catalog[pid]['name']}.")
    total = sum(catalog[pid]["price_paise"] * qty for pid, qty in quantities.items())
    order_id = uuid.uuid4()
    try:
        remote = client.order.create(data={
            "amount": total, "currency": "INR",
            "receipt": f"rf-{order_id.hex[:24]}",
            "notes": {"rescueflow_order_id": str(order_id), "environment": "test"}
        })
    except Exception as exc:
        raise HTTPException(502, "Razorpay Test Mode could not create the checkout order.") from exc
    try:
        with db.begin():
            db.execute(text("""
                INSERT INTO commerce_orders(id,customer_name,customer_email,customer_session,status,total_paise,razorpay_order_id)
                VALUES(:id,:name,:email,:session,'payment_pending',:total,:rzid)
            """), {"id":order_id,"name":payload.customer_name,"email":payload.customer_email,"session":payload.customer_session,"total":total,"rzid":remote["id"]})
            for pid, qty in quantities.items():
                db.execute(text("""
                    INSERT INTO commerce_order_items(id,order_id,product_id,quantity,unit_price_paise)
                    VALUES(:id,:oid,:pid,:qty,:price)
                """), {"id":uuid.uuid4(),"oid":order_id,"pid":pid,"qty":qty,"price":catalog[pid]["price_paise"]})
            db.execute(text("""
                INSERT INTO commerce_payments(id,order_id,status,amount_paise,provider)
                VALUES(:id,:oid,'pending',:amount,'razorpay_test')
            """), {"id":uuid.uuid4(),"oid":order_id,"amount":total})
            db.execute(text("""
                INSERT INTO commerce_order_events(id,order_id,event_type,message,event_data)
                VALUES(:id,:oid,'checkout.created','Razorpay Test Mode checkout order created.',jsonb_build_object('provider_order_id',:provider_id,'mode','test'))
            """), {"id":uuid.uuid4(),"oid":order_id,"provider_id":remote["id"]})
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, "Checkout was created with the provider but could not be saved locally. Contact support before retrying.") from exc
    return {"order_id":str(order_id),"razorpay_order_id":remote["id"],"amount":total,"currency":"INR","key_id":settings.RAZORPAY_KEY_ID,"mode":"test","customer_name":payload.customer_name,"customer_email":payload.customer_email}

@router.post("/checkout/verify")
def verify_checkout(payload: VerifyIn, db: Session = Depends(get_db)):
    client = _razorpay()
    row = db.execute(text("""
        SELECT o.id,o.customer_session,o.status,o.total_paise,o.razorpay_order_id,
               p.status AS payment_status
        FROM commerce_orders o JOIN commerce_payments p ON p.order_id=o.id
        WHERE o.id=:oid AND o.customer_session=:session FOR UPDATE OF o,p
    """), {"oid":payload.order_id,"session":payload.customer_session}).mappings().first()
    if not row:
        raise HTTPException(404,"Checkout order not found.")
    if row["razorpay_order_id"] != payload.razorpay_order_id:
        raise HTTPException(400,"Payment provider order does not match the local order.")
    if row["payment_status"] == "captured":
        return {"verified":True,"order_id":str(payload.order_id),"status":"captured","message":"Payment already verified; no duplicate incident created."}
    if row["payment_status"] != "pending":
        raise HTTPException(409,"This checkout is not awaiting payment verification.")
    db.commit()
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id":payload.razorpay_order_id,
            "razorpay_payment_id":payload.razorpay_payment_id,
            "razorpay_signature":payload.razorpay_signature
        })
        remote=client.payment.fetch(payload.razorpay_payment_id)
    except Exception as exc:
        raise HTTPException(400,"Razorpay payment signature or provider lookup could not be verified.") from exc
    if remote.get("order_id") != payload.razorpay_order_id or int(remote.get("amount",-1)) != int(row["total_paise"]) or remote.get("currency") != "INR" or remote.get("status") != "captured":
        raise HTTPException(409,"Payment is not confirmed as captured for the expected amount and order.")
    case_id=uuid.uuid4()
    try:
        with db.begin():
            locked=db.execute(text("SELECT status FROM commerce_payments WHERE order_id=:oid FOR UPDATE"),{"oid":payload.order_id}).scalar_one()
            if locked == "captured":
                return {"verified":True,"order_id":str(payload.order_id),"status":"captured","message":"Payment already verified."}
            db.execute(text("UPDATE commerce_payments SET status='captured',provider_payment_id=:pid WHERE order_id=:oid"),{"pid":payload.razorpay_payment_id,"oid":payload.order_id})
            db.execute(text("UPDATE commerce_orders SET status='recovery_required',razorpay_payment_id=:pid WHERE id=:oid"),{"pid":payload.razorpay_payment_id,"oid":payload.order_id})
            if settings.DEMO_SHIPMENT_FAILURE:
                db.execute(text("INSERT INTO commerce_shipments(id,order_id,status,carrier,failure_reason) VALUES(:id,:oid,'failed','Demo carrier','Carrier allocation timed out after verified payment. This is an intentional demo failure.')"),{"id":uuid.uuid4(),"oid":payload.order_id})
                db.execute(text("""
                    INSERT INTO recovery_cases(id,external_transaction_id,customer_reference,order_reference,payment_reference,failure_type,status,severity,description,context)
                    SELECT :cid,'RF-' || upper(substr(replace(o.id::text,'-',''),1,12)),o.customer_session,o.id::text,p.provider_payment_id,
                      'shipment_creation_failed','detected','high',
                      'Shipment creation failed after successful payment.',
                      jsonb_build_object('customer_name',o.customer_name,'customer_email',o.customer_email,'amount',o.total_paise/100.0,'payment_status','captured','order_status','created','shipment_status','failed','delivery_address','Address captured at checkout','recovery_path','Pending policy evaluation','commerce_order_id',o.id::text,'simulated_shipment_failure',true)
                    FROM commerce_orders o JOIN commerce_payments p ON p.order_id=o.id WHERE o.id=:oid
                """),{"cid":case_id,"oid":payload.order_id})
                db.execute(text("""
                    INSERT INTO case_events(id,case_id,event_type,message,actor,event_data)
                    VALUES
                    (:e1,:cid,'payment_captured','Razorpay Test Mode payment verified and captured.','razorpay_verifier',jsonb_build_object('provider_payment_id',:pid)),
                    (:e2,:cid,'order_created','Commerce order persisted and linked to verified payment.','order_service','{}'::jsonb),
                    (:e3,:cid,'shipment_failed','Demo carrier allocation timed out; recovery case opened.','shipment_adapter',jsonb_build_object('simulated',true))
                """),{"e1":uuid.uuid4(),"e2":uuid.uuid4(),"e3":uuid.uuid4(),"cid":case_id,"pid":payload.razorpay_payment_id})
            db.execute(text("""
                INSERT INTO commerce_order_events(id,order_id,event_type,message,event_data)
                VALUES(:id,:oid,'payment.captured','Razorpay Test Mode payment verified; order entered shipment recovery.',jsonb_build_object('payment_id',:pid,'recovery_case_id',:cid,'shipment_failure_simulated',:failed))
            """),{"id":uuid.uuid4(),"oid":payload.order_id,"pid":payload.razorpay_payment_id,"cid":str(case_id),"failed":settings.DEMO_SHIPMENT_FAILURE})
    except Exception as exc:
        db.rollback()
        raise HTTPException(500,"Payment is provider-verified but local order finalization failed. Reconcile before retrying.") from exc
    return {"verified":True,"order_id":str(payload.order_id),"status":"captured","shipment_status":"failed" if settings.DEMO_SHIPMENT_FAILURE else "pending","recovery_case_id":str(case_id) if settings.DEMO_SHIPMENT_FAILURE else None,"message":"Payment verified. Order created; shipment failure recorded for recovery." if settings.DEMO_SHIPMENT_FAILURE else "Payment verified and order created."}

@router.get("/orders")
def list_orders(customer_session: str, db: Session = Depends(get_db)):
    rows=db.execute(text("""
        SELECT o.id,o.customer_name,o.customer_email,o.status,o.total_paise,o.created_at,
               p.status AS payment_status,p.provider_payment_id,s.status AS shipment_status,
               c.id AS recovery_case_id,c.failure_type
        FROM commerce_orders o LEFT JOIN commerce_payments p ON p.order_id=o.id
        LEFT JOIN commerce_shipments s ON s.order_id=o.id
        LEFT JOIN recovery_cases c ON c.order_reference=o.id::text
        WHERE o.customer_session=:session ORDER BY o.created_at DESC
    """),{"session":customer_session}).mappings().all()
    return [dict(r) for r in rows]

@router.get("/orders/{order_id}")
def get_order(order_id: UUID, customer_session: str, db: Session = Depends(get_db)):
    row=db.execute(text("""
        SELECT o.id,o.customer_name,o.customer_email,o.status,o.total_paise,o.currency,o.created_at,
               p.status AS payment_status,p.provider_payment_id,s.status AS shipment_status,s.failure_reason
        FROM commerce_orders o LEFT JOIN commerce_payments p ON p.order_id=o.id
        LEFT JOIN commerce_shipments s ON s.order_id=o.id
        WHERE o.id=:oid AND o.customer_session=:session
    """),{"oid":order_id,"session":customer_session}).mappings().first()
    if not row: raise HTTPException(404,"Order not found.")
    events=db.execute(text("SELECT event_type,message,event_data,created_at FROM commerce_order_events WHERE order_id=:oid ORDER BY created_at"),{"oid":order_id}).mappings().all()
    return {"order":dict(row),"events":[dict(e) for e in events]}
