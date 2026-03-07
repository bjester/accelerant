import {signInWithEmailAndPassword, signOut} from "firebase/auth";
import StrategyHandler from "./index.js";


const CACHE_NAME = 'auth';
const STATUS_ENDPOINT = 'status';


class AuthStrategyHandler extends StrategyHandler {
  static get cacheName() {
    return CACHE_NAME;
  }

  get auth() {
    return this.runtime.firebase.auth;
  }

  async getCacheKey(request, mode) {
    return new Request(`${self.location.origin}${this.apiPath}/${STATUS_ENDPOINT}`);
  }

  _normalizeRequiredClaims(required) {
    if (!required) {
      return null;
    }
    if (Array.isArray(required)) {
      const result = {};
      for (const key of required) {
        result[key] = true;
      }
      return result;
    }
    if (typeof required === 'object') {
      return required;
    }
    return null;
  }

  _hasRequiredClaims(claims, required) {
    const normalized = this._normalizeRequiredClaims(required);
    if (!normalized) {
      return true;
    }
    for (const [key, value] of Object.entries(normalized)) {
      if (value === true) {
        if (!claims[key]) {
          return false;
        }
      } else if (claims[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param {Error} error
   * @return {Response}
   * @private
   */
  _handleError(error) {
    switch (error.code) {
      case 'auth/user-disabled':
      case 'auth/invalid-email':
        return this.runtime.response.json.badRequest('invalid');
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return this.runtime.response.json.forbidden('permission-denied');
      case 'auth/permission-denied':
        return this.runtime.response.json.forbidden('permission-denied');
      default:
        return super._handleError(error);
    }
  }

  async _handleStatus() {
    if (this.auth.currentUser) {
      return this.runtime.response.json.ok({
        authenticated: true,
        user: {
          id: this.auth.currentUser.uid,
          name: this.auth.currentUser.displayName,
          email: this.auth.currentUser.email,
        }
      });
    } else {
      return this.runtime.response.json.ok({
        authenticated: false,
        user: null,
      });
    }
  }
}

export class PostStrategyHandler extends AuthStrategyHandler {
  get allowedMethods() { return ['POST']; }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const context = this._getContext(request);

    // Fixed: Remove leading slash for consistency
    const path = context.path.replace(/^\/+/, '');

    switch (path) {
      case 'sign-in':
        return await this._handleSignIn(context);
      case 'sign-out':
        return await this._handleSignOut(context);
      default:
        console.log('path not found', context.path);
        return this.runtime.response.json.notFound('not-found: ' + context.path);
    }
  }

  async _handleSignIn(context) {
    const {email, password} = await context.json();
    const {user} = await signInWithEmailAndPassword(this.auth, email, password);
    const idTokenResult = await user.getIdTokenResult();

    const requiredClaims = this.runtime.config?.requireClaims || null;
    if (requiredClaims && !this._hasRequiredClaims(idTokenResult.claims || {}, requiredClaims)) {
      await signOut(this.auth);
      const e = new Error('permission-denied');
      e.code = 'auth/permission-denied';
      throw e;
    }

    return await this._handleStatus();
  }

  async _handleSignOut(context) {
    await signOut(this.auth);
    return await this._handleStatus();
  }
}

export class GetStrategyHandler extends AuthStrategyHandler {
  get allowedMethods() { return ['GET']; }

  async _doFetch(request) {
    const context = this._getContext(request);

    // Fixed: Remove leading slash for consistency
    const path = context.path.replace(/^\/+/, '');

    switch (path) {
      case STATUS_ENDPOINT:
        return await this._handleStatus();
      default:
        return this.runtime.response.json.notFound('not-found');
    }
  }
}
