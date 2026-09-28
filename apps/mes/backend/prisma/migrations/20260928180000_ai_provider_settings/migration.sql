CREATE TABLE "AiProviderSettings" (
  "tenantId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "keyCiphertext" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiProviderSettings_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "AiProviderSettings" ADD CONSTRAINT "AiProviderSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
