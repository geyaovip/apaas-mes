CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'raw',
    "unit" TEXT NOT NULL DEFAULT '件',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Material_tenantId_sku_key" ON "Material"("tenantId", "sku");
CREATE INDEX "Material_tenantId_active_name_idx" ON "Material"("tenantId", "active", "name");
ALTER TABLE "Material" ADD CONSTRAINT "Material_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Bom" ADD COLUMN "productMaterialId" TEXT;
ALTER TABLE "BomItem" ADD COLUMN "materialId" TEXT;
ALTER TABLE "PlanMaterial" ADD COLUMN "materialId" TEXT;

-- Keep existing BOMs usable: turn their saved product/component snapshots into master records.
INSERT INTO "Material" ("id", "tenantId", "sku", "name", "kind", "unit", "updatedAt")
SELECT gen_random_uuid()::text, source."tenantId", source."productSku", source."productName", 'finished', '件', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("tenantId", "productSku") "tenantId", "productSku", "productName"
  FROM "Bom" ORDER BY "tenantId", "productSku", "revision" DESC
) AS source;

INSERT INTO "Material" ("id", "tenantId", "sku", "name", "kind", "unit", "updatedAt")
SELECT gen_random_uuid()::text, source."tenantId", source."componentSku", source."componentName", 'raw', source."unit", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (bom."tenantId", item."componentSku") bom."tenantId", item."componentSku", item."componentName", item."unit"
  FROM "BomItem" AS item JOIN "Bom" AS bom ON bom."id" = item."bomId"
  ORDER BY bom."tenantId", item."componentSku", bom."revision" DESC
) AS source
ON CONFLICT ("tenantId", "sku") DO NOTHING;

UPDATE "Bom" AS bom SET "productMaterialId" = material."id"
FROM "Material" AS material WHERE material."tenantId" = bom."tenantId" AND material."sku" = bom."productSku";
UPDATE "BomItem" AS item SET "materialId" = material."id"
FROM "Bom" AS bom, "Material" AS material
WHERE bom."id" = item."bomId" AND material."tenantId" = bom."tenantId" AND material."sku" = item."componentSku";
UPDATE "PlanMaterial" AS requirement SET "materialId" = material."id"
FROM "Material" AS material WHERE material."tenantId" = requirement."tenantId" AND material."sku" = requirement."componentSku";

ALTER TABLE "Bom" ADD CONSTRAINT "Bom_productMaterialId_fkey" FOREIGN KEY ("productMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanMaterial" ADD CONSTRAINT "PlanMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
