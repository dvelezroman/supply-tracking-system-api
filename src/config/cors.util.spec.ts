import { expandOriginAliases, readAllowedCorsOrigins } from './cors.util';

describe('cors.util', () => {
  it('expands www and apex for production domains', () => {
    expect(expandOriginAliases('https://marea-alta.ec')).toEqual([
      'https://marea-alta.ec',
      'https://www.marea-alta.ec',
    ]);
    expect(expandOriginAliases('https://www.marea-alta.ec')).toEqual([
      'https://www.marea-alta.ec',
      'https://marea-alta.ec',
    ]);
  });

  it('does not expand localhost', () => {
    expect(expandOriginAliases('http://localhost:4200')).toEqual([
      'http://localhost:4200',
    ]);
  });

  it('merges CORS_ORIGIN list with aliases', () => {
    expect(
      readAllowedCorsOrigins({
        CORS_ORIGIN: 'https://app.example.com',
        FRONTEND_URL: 'https://ignored.com',
      }),
    ).toEqual(['https://app.example.com', 'https://www.app.example.com']);
  });

  it('falls back to FRONTEND_URL when CORS_ORIGIN unset', () => {
    expect(
      readAllowedCorsOrigins({
        FRONTEND_URL: 'https://marea-alta.ec/',
      }),
    ).toEqual(['https://marea-alta.ec', 'https://www.marea-alta.ec']);
  });
});
