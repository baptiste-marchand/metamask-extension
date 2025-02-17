// packages/sdk-multichain/src/providers/MultichainProvider.ts
import { ExtensionProvider } from './ExtensionProvider';

const DEFAULT_SESSION_ID = 'SINGLE_SESSION_ONLY';

export class MetamaskMultichain {
  sessions = new Map();

  provider;

  listeners = {
    sessionChanged: new Set(),
    notification: new Set(),
  };

  logger;

  constructor(params) {
    this.logger = params?.logger ?? console;

    this.logger?.debug('[MetamaskMultichain] Initializing with params:', {
      hasExistingProvider: Boolean(params?.existingProvider),
      hasExistingStream: Boolean(params?.existingStream),
      preferredProvider: params?.preferredProvider,
    });

    this.provider = new ExtensionProvider({
      logger: this.logger,
      eip1193Provider: params?.existingProvider,
      existingStream: params?.existingStream,
      preferredProvider: params?.preferredProvider,
    });

    this.provider.onNotification((notification) => {
      this.notify('notification', notification);
    });
  }

  addListener(event, listener) {
    this.listeners[event].add(listener);
  }

  removeListener(event, listener) {
    this.listeners[event].delete(listener);
  }

  notify(event, data) {
    this.logger?.debug(
      `MetamaskMultichain received event: ${event} / type: ${typeof data}`,
      data,
    );

    if (event === 'sessionChanged') {
      const sessionEventData = data;
      // Update the session data
      this.sessions.set(
        sessionEventData.session.sessionId,
        sessionEventData.session,
      );
      this.listeners.sessionChanged.forEach((listener) =>
        listener(sessionEventData),
      );
    } else if (event === 'notification') {
      this.logger?.debug('[MetamaskMultichain] Received notification:', data);
      if (
        typeof data === 'object' &&
        data !== null &&
        'method' in data &&
        data.method === 'wallet_sessionChanged' &&
        'params' in data &&
        typeof data.params === 'object' &&
        'sessionScopes' in data.params
      ) {
        const updatedSessionScope = data.params;
        const session = this.sessions.get(DEFAULT_SESSION_ID);

        this.logger?.debug(
          '[MetamaskMultichain] wallet_sessionChanged received',
          {
            sessionId: DEFAULT_SESSION_ID,
            updatedSessionScope,
          },
        );

        if (session) {
          session.sessionScopes = updatedSessionScope.sessionScopes;
          session.sessionProperties = updatedSessionScope.sessionProperties;
          session.expiry = updatedSessionScope.expiry;
          session.sessionId = updatedSessionScope.sessionId;
          session.scopedProperties = updatedSessionScope.scopedProperties;

          this.sessions.set(DEFAULT_SESSION_ID, session);
          this.logger?.debug('[MetamaskMultichain] Updated session:', session);

          this.logger?.debug(
            `[MetamaskMultichain] Notifying sessionChanged listeners ${this.listeners.sessionChanged.size}`,
          );
          this.listeners.sessionChanged.forEach((listener) =>
            listener({
              type: 'updated',
              session,
            }),
          );
        }
      } else {
        this.logger?.error(
          '[MetamaskMultichain] Received unknown notification:',
          data,
        );
        this.listeners.notification.forEach((listener) => listener(data));
      }
    } else {
      this.logger?.error(
        '[MetamaskMultichain] Received unknown event:',
        event,
        data,
      );
    }
  }

  async connect({ extensionId }) {
    this.logger?.log('[Caip25MultichainProvider] Connecting...', extensionId);

    try {
      const res = this.provider.connect({ extensionId });

      this.logger?.log('res', res);

      return res;
    } catch (e) {
      this.logger?.log('Error in connect', e);
    } finally {
      this.logger?.log('finally');
    }

    return true;
  }

  disconnect() {
    this.logger?.debug('[Caip25MultichainProvider] Disconnecting...');
    // Clear all sessions
    this.sessions.clear();
    // Clear all listeners
    this.listeners.sessionChanged.clear();
    this.listeners.notification.clear();
    // Disconnect the provider
    this.provider.disconnect();
  }

  async createSession({
    requiredScopes = {},
    optionalScopes = {},
    scopedProperties = {},
    sessionProperties = {},
  }) {
    this.logger?.debug(
      '[Caip25MultichainProvider] createSession with params:',
      {
        requiredScopes,
        optionalScopes,
        scopedProperties,
        sessionProperties,
      },
    );

    // Define default notifications for each chain
    const defaultNotifications = []; // wallet_notify?

    // Format scopes with notifications
    const formattedOptionalScopes = Object.entries(optionalScopes).reduce(
      (acc, [chainId, scope]) => ({
        ...acc,
        [chainId]: {
          methods: Array.isArray(scope.methods) ? scope.methods : [],
          notifications: defaultNotifications,
          accounts: Array.isArray(scope.accounts) ? scope.accounts : [],
        },
      }),
      {},
    );

    const params = {
      optionalScopes: formattedOptionalScopes,
      // Only include other params if they're not empty
      ...(Object.keys(requiredScopes).length > 0 && { requiredScopes }),
      ...(Object.keys(scopedProperties).length > 0 && { scopedProperties }),
      ...(Object.keys(sessionProperties).length > 0 && { sessionProperties }),
    };

    this.logger?.debug(
      '[MetamaskMultichain] Creating session with params:',
      params,
    );

    const result = await this.provider.request({
      method: 'wallet_createSession',
      params,
    });

    this.logger?.debug(
      '[Caip25MultichainProvider] wallet_createSession response:',
      result,
    );

    const sessionId = result.sessionId ?? DEFAULT_SESSION_ID;
    const sessionRecord = {
      sessionId: result.sessionId,
      sessionScopes: result.sessionScopes,
      scopedProperties: result.scopedProperties,
      sessionProperties: result.sessionProperties,
      expiry: result.sessionProperties?.expiry,
    };

    this.sessions.set(sessionId, sessionRecord);

    this.notify('sessionChanged', {
      type: 'created',
      session: sessionRecord,
    });

    return result;
  }

  async revokeSession(params) {
    const idToUse = params?.sessionId ?? DEFAULT_SESSION_ID;
    const session = this.sessions.get(idToUse);
    if (!session) {
      this.logger?.debug(
        '[Caip25MultichainProvider] No session found to revoke for:',
        idToUse,
      );
      return false;
    }

    this.logger?.debug('[Caip25MultichainProvider] Revoking session:', idToUse);

    await this.provider.request({
      method: 'wallet_revokeSession',
      params: [idToUse],
    });

    this.sessions.delete(idToUse);
    this.notify('sessionChanged', {
      type: 'revoked',
      session,
    });

    return true;
  }

  async getSession(params) {
    const idToUse = params?.sessionId ?? DEFAULT_SESSION_ID;
    const session = this.sessions.get(idToUse);
    if (!session) {
      this.logger?.debug(
        '[Caip25MultichainProvider] Session not found:',
        idToUse,
      );
      // call wallet_getSession to get the session
      const result = await this.provider.request({
        method: 'wallet_getSession',
        params: [idToUse],
      });
      this.sessions.set(idToUse, result);
      return result;
    }
    return session;
  }

  async invokeMethod({ scope, request }) {
    this.logger?.debug(
      '[Caip25MultichainProvider] Invoking method:',
      request.method,
      'on scope:',
      scope,
    );

    const result = await this.provider.request({
      method: 'wallet_invokeMethod',
      params: { scope, request },
    });

    return result;
  }
}
