const { strict: assert } = require('assert');
const {
  withFixtures,
  openDapp,
  unlockWallet,
  WINDOW_TITLES,
} = require('../../helpers');
const FixtureBuilder = require('../../fixture-builder');

describe('Permissions', function () {
  it('sets permissions and connect to Dapp', async function () {
    await withFixtures(
      {
        dapp: true,
        fixtures: new FixtureBuilder().build(),
        title: this.test.fullTitle(),
      },
      async ({ driver, localNodes }) => {
        const addresses = await localNodes[0].getAccounts();
        const publicAddress = addresses[0].toLowerCase();
        await unlockWallet(driver);

        await openDapp(driver);
        await driver.clickElement({
          text: 'Connect',
          tag: 'button',
        });

        await driver.switchToWindowWithTitle(WINDOW_TITLES.Dialog);
        await driver.clickElementAndWaitForWindowToClose({
          text: 'Connect',
          tag: 'button',
        });

        await driver.switchToWindowWithTitle(
          WINDOW_TITLES.ExtensionInFullScreenView,
        );

        // shows connected sites
        await driver.clickElement(
          '[data-testid="account-options-menu-button"]',
        );
        await driver.clickElement({
          text: 'All Permissions',
          tag: 'div',
        });
        await driver.waitForSelector({
          text: '127.0.0.1:8080',
          tag: 'p',
        });
        const domains = await driver.findClickableElements(
          '[data-testid="connection-list-item"]',
        );
        assert.equal(domains.length, 1);

        // can get accounts within the dapp
        await driver.switchToWindowWithTitle(WINDOW_TITLES.TestDApp);

        await driver.clickElement({
          text: 'eth_accounts',
          tag: 'button',
        });

        await driver.waitForSelector({
          css: '#getAccountsResult',
          text: publicAddress,
        });
      },
    );
  });
});
