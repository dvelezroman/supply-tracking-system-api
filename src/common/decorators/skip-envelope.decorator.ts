import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipResponseEnvelope';

/**
 * Skip the global { success, data, timestamp } wrapper for this handler or controller.
 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
