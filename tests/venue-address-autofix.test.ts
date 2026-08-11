import { describe, test, expect } from 'bun:test';
import { buildProposals, type ProposalGeocoder } from '../scripts/venue-address-autofix';

// Stub geocoder: found venues get a display name + confidence; unknown → null.
// The not-found case MUST still produce a proposal row (proposedAddress: null)
// — the human decides; silently dropping an addressless venue re-creates the
// F2b blind-fire class this tool exists to prevent.
const stub: ProposalGeocoder = async (venue) => {
  if (venue === 'Known Hall') {
    return { displayName: 'Panepistimiou 1, Athens 105 64', confidence: 'high', googleLocationType: 'ROOFTOP' };
  }
  return null;
};

describe('buildProposals', () => {
  test('geocoded venue → proposal with address + confidence', async () => {
    const rows = await buildProposals(['Known Hall'], stub);
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedAddress).toBe('Panepistimiou 1, Athens 105 64');
    expect(rows[0].geocodeConfidence).toBe('high');
  });

  test('not-found venue is STILL proposed with null address (human must decide)', async () => {
    const rows = await buildProposals(['Mystery Basement'], stub);
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedAddress).toBeNull();
  });

  test('duplicate venue names dedupe to one proposal', async () => {
    const rows = await buildProposals(['Known Hall', 'Known Hall'], stub);
    expect(rows).toHaveLength(1);
  });

  test('a throwing geocoder degrades that venue to a null-address proposal (fault isolation)', async () => {
    const boom: ProposalGeocoder = async () => {
      throw new Error('quota');
    };
    const rows = await buildProposals(['Known Hall'], boom);
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedAddress).toBeNull();
  });
});
