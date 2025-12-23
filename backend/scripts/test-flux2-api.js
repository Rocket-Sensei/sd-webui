#!/usr/bin/env node

/**
 * Test script for flux2 API mode model
 * Tests external API integration with API key authentication
 */

const API_URL = process.env.BACKEND_URL || 'http://127.0.0.1:3000';

async function testFlux2() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Testing flux2 API Mode (External API)                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Submit generation request
  console.log('Step 1: Submitting generation request...');
  const response = await fetch(`${API_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'flux2',
      prompt: 'A serene mountain landscape at sunset',
      size: '1024x1024',
      n: 1
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Failed to submit request: ${response.status}`);
    console.error(error);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`✓ Job submitted: ${data.job_id}\n`);

  // Poll for completion
  console.log('Step 2: Polling for completion...');
  let job;
  let pollCount = 0;
  const maxPolls = 60; // 2 minutes max

  while (pollCount < maxPolls) {
    const jobResponse = await fetch(`${API_URL}/api/queue/${data.job_id}`);
    job = await jobResponse.json();

    if (job.status === 'completed' || job.status === 'failed') {
      break;
    }

    const progress = job.progress ? Math.round(job.progress * 100) : (pollCount * 2);
    process.stdout.write(`\r  Progress: ${progress}% (${job.status})`);
    await new Promise(r => setTimeout(r, 2000));
    pollCount++;
  }

  console.log('');
  console.log(`  Job status: ${job.status}`);

  if (job.status === 'failed') {
    console.error(`❌ Job failed: ${job.error}`);
    process.exit(1);
  }

  console.log(`✓ Generation ID: ${job.generation_id}\n`);

  // Verify generation record
  console.log('Step 3: Verifying generation record...');
  const genResponse = await fetch(`${API_URL}/api/generations/${job.generation_id}`);
  if (!genResponse.ok) {
    console.error('❌ Failed to fetch generation record');
    process.exit(1);
  }

  const generation = await genResponse.json();
  console.log(`✓ Found generation: ${generation.id}`);
  console.log(`  Model: ${generation.model}`);
  console.log(`  Prompt: ${generation.prompt}`);
  console.log(`  Images: ${generation.images?.length || 0}\n`);

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✓ flux2 API Mode Test PASSED                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}

testFlux2().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
