export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  labelLogoUrl: process.env.LABEL_LOGO_URL?.trim() || '',
  labelBrandName: process.env.LABEL_BRAND_NAME?.trim() || '',
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
