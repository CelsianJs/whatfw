# Bug: Cache Key Collision
The user profile shows wrong data. The "User" field shows theme/language settings instead of user info, or vice versa.
Two different data fetchers are using the same cache key, so they overwrite each other in the SWR cache.
