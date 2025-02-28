// packages/sdk-multichain/src/providers/MultichainProvider.ts
import { MultichainNetworks } from '../../shared/constants/multichain/networks';
import { ExtensionProvider } from './ExtensionProvider';

export class MetamaskMultichain {
  session;

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
      this.session = sessionEventData.session;
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

        this.logger?.debug(
          '[MetamaskMultichain] wallet_sessionChanged received',
          {
            updatedSessionScope,
          },
        );

        if (this.session) {
          this.session.sessionScopes = updatedSessionScope.sessionScopes;
          this.session.sessionProperties =
            updatedSessionScope.sessionProperties;
          this.session.expiry = updatedSessionScope.expiry;
          this.session.sessionId = updatedSessionScope.sessionId;
          this.session.scopedProperties = updatedSessionScope.scopedProperties;

          this.logger?.debug(
            '[MetamaskMultichain] Updated session:',
            this.session,
          );

          this.logger?.debug(
            `[MetamaskMultichain] Notifying sessionChanged listeners ${this.listeners.sessionChanged.size}`,
          );
          this.listeners.sessionChanged.forEach((listener) =>
            listener({
              type: 'updated',
              session: this.session,
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
      await this.provider.connect({ extensionId });

      this.provider.chromePort.onMessage.addListener((msg) => {
        console.log(msg.data);
      });

      const session = await this.createSession({
        optionalScopes: {
          [MultichainNetworks.SOLANA]: {
            methods: ['getGenesisHash', 'signMessage'],
            notifications: ['accountsChanged', 'chainChanged'],
            accounts: [
              `${MultichainNetworks.SOLANA}:6AwJL1LnMjwsB8GkJCPexEwznnhpiMV4DHv8QsRLtnNc`,
            ],
          },
        },
      });

      return session.sessionScopes[MultichainNetworks.SOLANA].accounts.map(
        (account) => account.slice(MultichainNetworks.SOLANA.length + 1),
      );
    } catch (e) {
      this.logger?.log('Error in connect', e);
    } finally {
      this.logger?.log('finally');
    }

    return true;
  }

  async disconnect() {
    this.logger?.debug('[Caip25MultichainProvider] Disconnecting...');
    // Revoke the session
    await this.revokeSession();

    // Clear all listeners
    this.listeners.sessionChanged.clear();
    this.listeners.notification.clear();
    // Disconnect the provider
    this.provider.disconnect();

    this.logger?.log('disconnected and revoked session');
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

    const sessionRecord = {
      sessionScopes: result.sessionScopes,
      scopedProperties: result.scopedProperties,
      sessionProperties: result.sessionProperties,
      expiry: result.sessionProperties?.expiry,
    };

    this.session = sessionRecord;

    this.notify('sessionChanged', {
      type: 'created',
      session: sessionRecord,
    });

    return result;
  }

  async revokeSession() {
    const { session } = this;

    if (!this.session) {
      this.logger?.debug('[Caip25MultichainProvider] No session to revoke');
      return false;
    }

    this.logger?.debug('[Caip25MultichainProvider] Revoking session...');

    await this.provider.request({
      method: 'wallet_revokeSession',
    });

    this.session = undefined;
    this.notify('sessionChanged', {
      type: 'revoked',
      session,
    });

    return true;
  }

  async getSession() {
    if (!this.session) {
      this.logger?.debug('[Caip25MultichainProvider] No session set');
      // call wallet_getSession to get the session
      const result = await this.provider.request({
        method: 'wallet_getSession',
      });
      this.session = result;
      return result;
    }
    return this.session;
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
