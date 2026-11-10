-- Thêm link sản phẩm cho bảng pancake_products
ALTER TABLE public.pancake_products
ADD COLUMN IF NOT EXISTS product_link text;

COMMENT ON COLUMN public.pancake_products.product_link
IS 'Link trang mua hàng / trang chi tiết sản phẩm';
