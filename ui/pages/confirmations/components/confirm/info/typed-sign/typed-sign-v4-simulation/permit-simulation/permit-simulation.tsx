import { Hex } from '@metamask/utils';
import React from 'react';
import { PrimaryType } from '../../../../../../../../../shared/constants/signatures';
import { parseTypedDataMessage } from '../../../../../../../../../shared/modules/transaction.utils';
import { ConfirmInfoRow } from '../../../../../../../../components/app/confirm/info/row';
import { Box } from '../../../../../../../../components/component-library';
import {
  Display,
  FlexDirection,
} from '../../../../../../../../helpers/constants/design-system';
import { useI18nContext } from '../../../../../../../../hooks/useI18nContext';
import { useConfirmContext } from '../../../../../../context/confirm';
import { SignatureRequestType } from '../../../../../../types/confirm';
import StaticSimulation from '../../../shared/static-simulation/static-simulation';
import PermitSimulationValueDisplay from '../value-display/value-display';

type TokenDetail = {
  token: string;
  amount: string;
};

function extractTokenDetailsByPrimaryType(
  message: Record<string, unknown>,
  primaryType: PrimaryType,
): TokenDetail[] | unknown {
  let tokenDetails;

  switch (primaryType) {
    case PrimaryType.PermitBatch:
    case PrimaryType.PermitSingle:
      tokenDetails = message?.details;
      break;
    case PrimaryType.PermitBatchTransferFrom:
    case PrimaryType.PermitTransferFrom:
      tokenDetails = message?.permitted;
      break;
    default:
      break;
  }

  const isNonArrayObject = tokenDetails && !Array.isArray(tokenDetails);

  return isNonArrayObject ? [tokenDetails] : tokenDetails;
}

const PermitSimulation: React.FC<object> = () => {
  const t = useI18nContext();
  const { currentConfirmation } = useConfirmContext<SignatureRequestType>();
  const msgData = currentConfirmation.msgParams?.data;
  const chainId = currentConfirmation.chainId as Hex;
  const {
    domain: { verifyingContract },
    message,
    message: { tokenId },
    primaryType,
  } = parseTypedDataMessage(msgData as string);
  const isNFT = tokenId !== undefined;

  const tokenDetails = extractTokenDetailsByPrimaryType(message, primaryType);

  const TokenDetail = ({
    token,
    amount,
  }: {
    token: Hex | string;
    amount: number | string;
  }) => (
    <PermitSimulationValueDisplay
      primaryType={primaryType}
      tokenContract={token}
      value={amount}
      chainId={chainId}
      message={message}
      canDisplayValueAsUnlimited
    />
  );

  const isRevoke = message.allowed === false;
  let infoRowLabelKey = 'spendingCap';
  let descriptionKey = 'permitSimulationDetailInfo';

  if (isRevoke) {
    descriptionKey = 'revokeSimulationDetailsDesc';
    infoRowLabelKey = 'permitSimulationChange_revoke2';
  } else if (isNFT) {
    descriptionKey = 'simulationDetailsApproveDesc';
    infoRowLabelKey = 'simulationApproveHeading';
  }

  const SpendingCapRow = (
    <ConfirmInfoRow label={t(infoRowLabelKey)}>
      <Box style={{ marginLeft: 'auto', maxWidth: '100%' }}>
        {Array.isArray(tokenDetails) ? (
          <Box
            display={Display.Flex}
            flexDirection={FlexDirection.Column}
            gap={2}
          >
            {tokenDetails.map(({ token, amount }, i: number) => (
              <TokenDetail
                token={token}
                amount={amount}
                key={`${token}-${i}`}
              />
            ))}
          </Box>
        ) : (
          <PermitSimulationValueDisplay
            tokenContract={verifyingContract}
            value={message.value}
            tokenId={message.tokenId}
            chainId={chainId}
            message={message}
            canDisplayValueAsUnlimited
          />
        )}
      </Box>
    </ConfirmInfoRow>
  );

  return (
    <StaticSimulation
      title={t('simulationDetailsTitle')}
      titleTooltip={t('simulationDetailsTitleTooltip')}
      description={t(descriptionKey)}
      simulationElements={SpendingCapRow}
    />
  );
};

export default PermitSimulation;
