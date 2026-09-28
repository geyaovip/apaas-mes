-- Older plans created before material master may reference SKUs never used by a BOM.
INSERT INTO "Material" ("id", "tenantId", "sku", "name", "kind", "unit", "updatedAt")
SELECT gen_random_uuid()::text, source."tenantId", source."productSku", source."product", 'finished', '件', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("tenantId", "productSku") "tenantId", "productSku", "product"
  FROM "ProductionPlan" ORDER BY "tenantId", "productSku", "createdAt" DESC
) AS source
ON CONFLICT ("tenantId", "sku") DO NOTHING;

UPDATE "ProductionPlan" AS plan SET "productMaterialId" = material."id"
FROM "Material" AS material
WHERE plan."productMaterialId" IS NULL AND material."tenantId" = plan."tenantId" AND material."sku" = plan."productSku";
