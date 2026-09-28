ALTER TABLE "ProductionPlan" ADD COLUMN "productMaterialId" TEXT;

UPDATE "ProductionPlan" AS plan SET "productMaterialId" = material."id"
FROM "Material" AS material
WHERE material."tenantId" = plan."tenantId" AND material."sku" = plan."productSku";

ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_productMaterialId_fkey"
FOREIGN KEY ("productMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
