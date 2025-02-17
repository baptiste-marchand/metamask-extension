// packages/sdk-multichain/src/providers/ExtensionProvider.ts
import { MetaMaskInpageProvider } from '@metamask/providers';

export const ProviderType = {
  EIP1193_PROVIDER: 'eip1193_provider',
  STREAM_PROVIDER: 'stream_provider',
};

export class ExtensionProvider {
  logger;

  existingProvider;

  existingStream;

  preferredProvider;

  isConnected = false;

  streamProvider;

  requestId = 1;

  /**
   * Storing notification callbacks.
   * If we detect a "notification" (a message without an id) coming from
   * the extension or fallback, we'll call each callback in here.
   */
  notificationCallbacks = new Set();

  constructor(config) {
    console.log('ExtensionProvider:constructor', config);

    this.logger = config?.logger ?? console;
    this.existingProvider = config?.eip1193Provider;
    this.existingStream = config?.existingStream;
    this.preferredProvider = config?.preferredProvider;

    this.logger?.debug('[ExtensionProvider] Initialized with:', {
      hasExistingProvider: Boolean(this.existingProvider),
      hasExistingStream: Boolean(this.existingStream),
      preferredProvider: this.preferredProvider,
    });
  }

  /**
   * Attempts to connect.
   *
   * @param params
   */
  async connect(params) {
    console.log('[ExtensionProvider] Connect called with:', {
      params,
      // preferredProvider: this.preferredProvider,
      // hasExistingProvider: Boolean(this.existingProvider),
      hasExistingStream: Boolean(this.existingStream),
    });

    // First check if we have an existing provider
    if (this.existingProvider) {
      console.log('[ExtensionProvider] Using existing provider');
      this.isConnected = true;
      return true;
    }

    // Then try other connection methods
    try {
      if (this.existingStream) {
        console.log('[ExtensionProvider] Using existing stream');
        this.wrapStreamAsProvider(this.existingStream);
        this.isConnected = true;
        return true;
      }

      console.error('[ExtensionProvider] No valid provider available');
      throw new Error('No valid provider available');
    } catch (error) {
      console.error('[ExtensionProvider] Connection failed:', error);
      throw error;
    }
  }

  disconnect() {
    this.logger?.debug('[ExtensionProvider] disconnecting...');

    // Clean up stream provider
    if (this.streamProvider) {
      try {
        // Remove all listeners from the stream provider
        this.streamProvider.removeAllListeners();
        // @ts-expect-error - accessing property
        if (this.streamProvider._state?.stream) {
          // @ts-expect-error - accessing property
          this.streamProvider._state.stream.destroy();
        }
        this.streamProvider = undefined;
      } catch (error) {
        this.logger?.error(
          '[ExtensionProvider] Error cleaning up stream provider:',
          error,
        );
      }
    }

    // Reset connection state
    this.isConnected = false;

    // Clear all notification listeners
    this.removeAllNotificationListeners();
  }

  isConnectedToExtension() {
    return this.isConnected;
  }

  /**
   * EIP-1193-style request. Under the hood we choose the "transport"
   *
   * @param params
   */
  async request(params) {
    if (!this.isConnected) {
      throw new Error('[ExtensionProvider] Not connected');
    }

    switch (this.preferredProvider) {
      case ProviderType.EIP1193_PROVIDER:
        if (!this.existingProvider) {
          throw new Error('Existing provider requested but none available');
        }
        return this.existingProvider.request(params);

      case ProviderType.STREAM_PROVIDER:
        if (!this.streamProvider) {
          throw new Error('Stream provider requested but not initialized');
        }
        return this.streamProvider.request(params);

      default:
        // Use whatever provider is available
        if (this.existingProvider) {
          return this.existingProvider.request(params);
        }
        if (this.streamProvider) {
          return this.streamProvider.request(params);
        }
        throw new Error('No valid provider available');
    }
  }

  /**
   * Add a callback that fires whenever we receive a 'notification'
   * (a message without an id) from the extension or fallback.
   *
   * @param callback
   */
  onNotification(callback) {
    this.logger?.debug('[ExtensionProvider] Adding notification listener');
    this.notificationCallbacks.add(callback);
  }

  removeNotificationListener(callback) {
    this.logger?.debug('[ExtensionProvider] Removing notification listener');
    this.notificationCallbacks.delete(callback);
  }

  removeAllNotificationListeners() {
    this.logger?.debug(
      '[ExtensionProvider] Removing all notification listeners',
    );
    this.notificationCallbacks.clear();
  }

  // ============ Implementation ============
  wrapStreamAsProvider(stream) {
    this.logger?.debug('[ExtensionProvider] wrapping stream as provider');
    this.streamProvider = new MetaMaskInpageProvider(stream, {
      maxEventListeners: 100,
      shouldSendMetadata: true,
    });

    // Forward notifications from the stream provider
    this.streamProvider.on('notification', (notif) => {
      this.logger?.debug('[ExtensionProvider] stream notification:', notif);
      this.notifyCallbacks(notif);
    });
  }

  /**
   * Fire our local notification callbacks
   *
   * @param data
   */
  notifyCallbacks(data) {
    for (const cb of this.notificationCallbacks) {
      try {
        cb(data);
      } catch (err) {
        this.logger?.error(
          '[ExtensionProvider] Error in notification callback:',
          err,
        );
      }
    }
  }
}
