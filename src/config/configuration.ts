export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  labelLogoUrl: process.env.LABEL_LOGO_URL?.trim() || '',
  labelBrandName: process.env.LABEL_BRAND_NAME?.trim() || '',
  labelOwnerRuc: process.env.LABEL_OWNER_RUC?.trim() || '',
  labelOwnerLegalName: process.env.LABEL_OWNER_LEGAL_NAME?.trim() || 'MAREA ALTA',
  labelOwnerLocation:
    process.env.LABEL_OWNER_LOCATION?.trim() || 'Portoviejo - Manabí - Ecuador',
  labelArcsaNotification: process.env.LABEL_ARCSA_NOTIFICATION?.trim() || 'En trámite',
  /** Fallback when product/SKU catalog has no retail fields (existing production SKUs). */
  labelDefaultGtin13: process.env.LABEL_DEFAULT_GTIN13?.trim() || '',
  labelDefaultNetWeightOz: parseFloat(process.env.LABEL_DEFAULT_NET_WEIGHT_OZ ?? '') || undefined,
  labelDefaultNetWeightLbs: parseFloat(process.env.LABEL_DEFAULT_NET_WEIGHT_LBS ?? '') || undefined,
  labelDefaultTitle: process.env.LABEL_DEFAULT_TITLE?.trim() || '',
  bitflowLogoUrl: process.env.BITFLOW_LOGO_URL?.trim() || '',
  bitflowSiteUrl: process.env.BITFLOW_SITE_URL?.trim() || '',
  contactEmail: process.env.CONTACT_EMAIL?.trim() || '',
  /** Overrides landing toolbar text only (e.g. MAREA ALTA). When empty, uses LABEL_BRAND_NAME uppercased. */
  publicLandingTitle: process.env.PUBLIC_LANDING_TITLE?.trim() || '',
  /** Legacy: overrides landing toolbar when PUBLIC_LANDING_TITLE is unset. Prefer PUBLIC_LANDING_TITLE. */
  publicHeaderTitle: process.env.PUBLIC_HEADER_TITLE?.trim() || '',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
});
