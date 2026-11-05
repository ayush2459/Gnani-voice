"""commerce checkout and post-payment shipment incidents

Revision ID: 20261105_commerce
Revises: 135eb9feff0f
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261105_commerce"
down_revision = "135eb9feff0f"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "commerce_products",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("price_paise", sa.Integer(), nullable=False),
        sa.Column("stock_quantity", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("image_url", sa.Text()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "commerce_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("customer_name", sa.String(160), nullable=False),
        sa.Column("customer_email", sa.String(254), nullable=False),
        sa.Column("customer_session", sa.String(128), nullable=False, index=True),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("total_paise", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("razorpay_order_id", sa.String(100), unique=True),
        sa.Column("razorpay_payment_id", sa.String(100), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "commerce_order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.String(80), sa.ForeignKey("commerce_products.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_paise", sa.Integer(), nullable=False),
    )
    op.create_table(
        "commerce_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("provider_payment_id", sa.String(100), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "commerce_shipments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("carrier", sa.String(80)),
        sa.Column("tracking_reference", sa.String(100)),
        sa.Column("failure_reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "commerce_order_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("event_data", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    products = [
        ("aurora-headphones","Aurora Wireless Headphones","Immersive audio with adaptive noise cancellation.",699900,"https://images.unsplash.com/photo-150575역"),
        ("pulse-smartwatch","Pulse Smartwatch","Fitness, notifications and everyday health insights.",499900,"https://images.unsplash.com/photo-1523275335684-37898b6baf30"),
        ("nova-speaker","Nova Bluetooth Speaker","Portable sound with a rich, balanced profile.",299900,"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1"),
        ("arc-keyboard","Arc Mechanical Keyboard","Compact mechanical keyboard for focused work.",649900,"https://images.unsplash.com/photo-1587829741301-dc798b83add3"),
        ("orbit-mouse","Orbit Wireless Mouse","Ergonomic wireless mouse with precision tracking.",189900,"https://images.unsplash.com/photo-1527814050087-3793815479db"),
    ]
    for pid, name, description, price, image in products:
        if "역" in image:
            image = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
        op.get_bind().execute(sa.text("""
            INSERT INTO commerce_products(id,name,description,price_paise,image_url)
            VALUES (:id,:name,:description,:price,:image)
        """), {"id":pid,"name":name,"description":description,"price":price,"image":image})

def downgrade():
    op.drop_table("commerce_order_events")
    op.drop_table("commerce_shipments")
    op.drop_table("commerce_payments")
    op.drop_table("commerce_order_items")
    op.drop_table("commerce_orders")
    op.drop_table("commerce_products")
