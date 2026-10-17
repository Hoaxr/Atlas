/**
 * Cleanup obsolete untagged Docker Hub image manifests and old commit tags.
 * Preserves the 'latest' tag and any semantic version tags (e.g., v1.0.0).
 */

const https = require('https');

const DOCKERHUB_USERNAME = process.env.DOCKERHUB_USERNAME || 'bdekkernl';
const DOCKERHUB_TOKEN = process.env.DOCKERHUB_TOKEN;
const REPO = 'atlas';

if (!DOCKERHUB_TOKEN) {
  console.error('Error: DOCKERHUB_TOKEN is required.');
  process.exit(1);
}

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          if (data) json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  console.log(`Authenticating with Docker Hub as ${DOCKERHUB_USERNAME}...`);
  const loginRes = await request({
    hostname: 'hub.docker.com',
    path: '/v2/users/login/',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: DOCKERHUB_USERNAME,
    password: DOCKERHUB_TOKEN
  });

  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('Login failed:', loginRes.body);
    process.exit(1);
  }

  const token = loginRes.body.token;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log('Login successful.');

  // 1. Fetch tags to identify protected tags and protected manifests
  console.log('Fetching active repository tags...');
  const tagsRes = await request({
    hostname: 'hub.docker.com',
    path: `/v2/namespaces/${DOCKERHUB_USERNAME}/repositories/${REPO}/tags?page_size=100`,
    method: 'GET',
    headers
  });

  const protectedDigests = new Set();
  const tagsToDelete = [];

  if (tagsRes.status === 200 && tagsRes.body.results) {
    for (const tag of tagsRes.body.results) {
      const isLatest = tag.name === 'latest';
      const isSemVer = /^v\d+\.\d+\.\d+/.test(tag.name);

      if (isLatest || isSemVer) {
        console.log(`Protecting tag: ${tag.name} (digest: ${tag.digest})`);
        if (tag.digest) protectedDigests.add(tag.digest);
        if (Array.isArray(tag.images)) {
          for (const img of tag.images) {
            if (img.digest) {
              console.log(`  Protecting architecture image: ${img.digest} (${img.os}/${img.architecture})`);
              protectedDigests.add(img.digest);
            }
          }
        }
      } else {
        // Obsolete commit SHA tag
        tagsToDelete.push(tag.name);
      }
    }
  }

  // 2. Delete non-latest tags (e.g. short commit SHA tags)
  for (const tagName of tagsToDelete) {
    console.log(`Deleting obsolete tag: ${tagName}...`);
    const delTagRes = await request({
      hostname: 'hub.docker.com',
      path: `/v2/namespaces/${DOCKERHUB_USERNAME}/repositories/${REPO}/tags/${tagName}/`,
      method: 'DELETE',
      headers
    });
    console.log(`Tag delete response: ${delTagRes.status}`);
  }

  // 3. Fetch all manifests from Docker Hub
  console.log('\nFetching all repository manifests...');
  let allManifests = [];
  let nextKey = null;

  do {
    let path = `/v2/namespaces/${DOCKERHUB_USERNAME}/repositories/${REPO}/manifests`;
    if (nextKey) {
      path += `?last_evaluated_key=${encodeURIComponent(nextKey)}`;
    }

    const mRes = await request({
      hostname: 'hub.docker.com',
      path,
      method: 'GET',
      headers
    });

    if (mRes.status !== 200 || !mRes.body.manifests) {
      console.error(`Failed to fetch manifests (status ${mRes.status}):`, mRes.body);
      break;
    }

    allManifests = allManifests.concat(mRes.body.manifests);
    nextKey = mRes.body.last_evaluated_key || null;
    console.log(`Retrieved ${mRes.body.manifests.length} manifests (total so far: ${allManifests.length}). Next key: ${nextKey ? 'yes' : 'none'}`);
  } while (nextKey);

  console.log(`\nFound total of ${allManifests.length} manifests.`);

  // 4. Identify obsolete manifests to delete
  const digestsToDelete = [];
  let reclaimedBytes = 0;

  for (const m of allManifests) {
    const digest = m.manifest_digest;
    const isProtected = protectedDigests.has(digest);
    const hasProtectedTag = Array.isArray(m.tags) && m.tags.some(t => t === 'latest' || /^v\d+\.\d+\.\d+/.test(t));

    if (isProtected || hasProtectedTag) {
      console.log(`KEEPING: ${digest.slice(0, 19)}... | Tags: ${m.tags?.join(', ') || 'none'}`);
    } else {
      digestsToDelete.push(digest);
      reclaimedBytes += (m.total_size || m.size || 0);
    }
  }

  console.log(`\nIdentified ${digestsToDelete.length} obsolete manifests to delete (~${(reclaimedBytes / 1024 / 1024).toFixed(1)} MB).`);

  if (digestsToDelete.length === 0) {
    console.log('No manifests to delete! Everything is clean.');
    return;
  }

  // 5. Delete obsolete manifests in batches of 25
  const BATCH_SIZE = 25;
  let deletedCount = 0;

  for (let i = 0; i < digestsToDelete.length; i += BATCH_SIZE) {
    const batch = digestsToDelete.slice(i, i + BATCH_SIZE);
    console.log(`Deleting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} manifests)...`);

    const delRes = await request({
      hostname: 'hub.docker.com',
      path: `/v2/namespaces/${DOCKERHUB_USERNAME}/repositories/${REPO}/manifests`,
      method: 'DELETE',
      headers
    }, {
      digests: batch,
      delete_references: true
    });

    let success = false;
    if (delRes.status === 200 || delRes.status === 204) {
      deletedCount += batch.length;
      console.log(`✓ Successfully deleted batch of ${batch.length} via Hub API`);
      success = true;
    } else {
      console.log(`Hub API returned ${delRes.status} (${JSON.stringify(delRes.body)}). Attempting Registry API deletion...`);
      // Try deleting individually via Registry-1 API
      try {
        const authHeader = 'Basic ' + Buffer.from(`${DOCKERHUB_USERNAME}:${DOCKERHUB_TOKEN}`).toString('base64');
        const tokenRes = await request({
          hostname: 'auth.docker.io',
          path: `/token?service=registry.docker.io&scope=repository:${DOCKERHUB_USERNAME}/${REPO}:pull,delete`,
          method: 'GET',
          headers: { 'Authorization': authHeader }
        });

        if (tokenRes.status === 200 && tokenRes.body.token) {
          const regToken = tokenRes.body.token;
          for (const d of batch) {
            const regDelRes = await request({
              hostname: 'registry-1.docker.io',
              path: `/v2/${DOCKERHUB_USERNAME}/${REPO}/manifests/${d}`,
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${regToken}` }
            });
            if (regDelRes.status === 202 || regDelRes.status === 200) {
              deletedCount++;
            } else {
              console.log(`Registry API delete for ${d.slice(0, 19)}... returned ${regDelRes.status}`);
            }
          }
        } else {
          console.error('Failed to obtain Registry delete token:', tokenRes.status, tokenRes.body);
        }
      } catch (err) {
        console.error('Registry API error:', err.message);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Cleanup Complete!`);
  console.log(`Total manifests deleted: ${deletedCount}`);
  console.log(`Total reclaimed storage: ~${(reclaimedBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
