import styled from "styled-components";

import { Mono } from "components/RewardsTable";

const Ellipsis = styled(Mono)`
  display: inline-block;
  max-width: min(42ch, 46vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
`;

export default function AddressCell({ address }: { address: string }) {
  return <Ellipsis title={address}>{address}</Ellipsis>;
}
