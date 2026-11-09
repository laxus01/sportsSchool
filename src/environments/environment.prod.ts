export const environment = {
  production: true,
  licenseApiBaseUrl: 'https://sportsschoolbackend-production.up.railway.app/v1',
  licenseIssuer: 'https://sportsschoolbackend-production.up.railway.app',
  licenseAudience: 'SPORTS_SCHOOL',
  licenseSigningPublicKeys: {
    'railway-prod-2026-11': 'bM8SvvpROykXQx0o35qwfQEFmLOpgLu5ArpKB4VKwME',
  } as Record<string, string>,
};
