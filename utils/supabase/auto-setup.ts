/**
 * auto-setup.ts — re-exports from setup-db.ts for backward compatibility
 */
export {
  setupDatabase as autoSetup,
  upsertProfile as syncProfileToDB,
  fetchProfile as loadProfileFromDB,
  findEmailByUsername as lookupUsername,
} from './setup-db';
