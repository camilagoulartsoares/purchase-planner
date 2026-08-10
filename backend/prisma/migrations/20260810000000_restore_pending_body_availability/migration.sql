-- The previous availability rule treated an unverified preferred size as sold
-- out. Restore only bodies that were automatically moved to "Desisti da compra"
-- by that rule; the radar will revalidate each one against its original URL.
-- This is deliberately brand-agnostic.
UPDATE "Product"
SET
  "availability" = NULL,
  "status" = 'Quero comprar'
WHERE "availability" = 'out_of_stock'
  AND "status" = 'Desisti da compra'
  AND (
    lower(trim("name")) LIKE 'body %'
    OR lower(trim("category")) IN ('body', 'bodies')
  );
