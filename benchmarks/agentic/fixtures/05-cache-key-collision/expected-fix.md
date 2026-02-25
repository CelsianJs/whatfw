# Expected Fix
Use unique cache keys for each data source:
```
const { data: user } = useSWR('/api/user', fetchUser);
const { data: settings } = useSWR('/api/settings', fetchSettings);
```
Each useSWR call needs a unique key since the cache is shared globally by key.
