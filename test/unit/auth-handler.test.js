import { expect } from 'chai';
import JSONResponseFactory from '../../src/response/json.js';
import { PostStrategyHandler as AuthHandler } from '../../src/strategy/handler/auth.js';

function makeHandler(requireClaims = null) {
  process.env.NODE_ENV = 'production';
  const strategy = { plugins: [], responseFactory: new JSONResponseFactory() };
  const event = { waitUntil: () => {} };
  const request = new Request('http://localhost/api/auth/status', { method: 'GET' });
  const runtime = { config: { requireClaims } };
  return new AuthHandler(runtime, strategy, { event, request, params: undefined });
}

describe('AuthHandler requireClaims', () => {
  it('accepts array form as all true', () => {
    const handler = makeHandler(['admin', 'beta']);
    const ok = handler._hasRequiredClaims({ admin: true, beta: true }, ['admin', 'beta']);
    expect(ok).to.equal(true);
  });

  it('rejects missing claim', () => {
    const handler = makeHandler({ admin: true });
    const ok = handler._hasRequiredClaims({ admin: false }, { admin: true });
    expect(ok).to.equal(false);
  });

  it('accepts exact value match', () => {
    const handler = makeHandler({ tier: 'pro' });
    const ok = handler._hasRequiredClaims({ tier: 'pro' }, { tier: 'pro' });
    expect(ok).to.equal(true);
  });

  it('rejects wrong value match', () => {
    const handler = makeHandler({ tier: 'pro' });
    const ok = handler._hasRequiredClaims({ tier: 'free' }, { tier: 'pro' });
    expect(ok).to.equal(false);
  });
});
