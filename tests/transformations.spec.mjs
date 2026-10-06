import assert from 'assert';
import { DEFAULT_TRANSFORMATIONS } from '../transformations-data.js';
import { normalizeTransformation, transformationFromRow } from '../server/transformations.js';

assert.equal(DEFAULT_TRANSFORMATIONS.length, 7);

const normalized = normalizeTransformation({
  name: 'New Client',
  duration: '12 weeks',
  type: 'recomposition',
  story: 'A steady and sustainable change.',
  muscleStart: '34.12',
  muscleEnd: '35.26',
  fatStart: '22.4',
  fatEnd: '18.1',
  images: ['1.jpeg', 'transformation/new-client/2.jpeg'],
});
assert.deepEqual(normalized, {
  name: 'New Client',
  duration: '12 weeks',
  type: 'recomposition',
  story: 'A steady and sustainable change.',
  muscleStart: '34.1',
  muscleEnd: '35.3',
  fatStart: '22.4',
  fatEnd: '18.1',
  images: ['1.jpeg', 'transformation/new-client/2.jpeg'],
});

assert.throws(() => normalizeTransformation({ ...normalized, type: 'unknown' }), /category/i);
assert.throws(() => normalizeTransformation({
  ...normalized,
  muscleStart: 35,
  muscleEnd: 34,
  fatStart: 20,
  fatEnd: 15,
  images: ['../private.jpg'],
}), /relative paths/i);
assert.throws(() => normalizeTransformation({
  ...normalized,
  muscleStart: 35,
  muscleEnd: 34,
  fatStart: 101,
  fatEnd: 15,
}), /body fat must be a number/i);

assert.deepEqual(transformationFromRow({
  id: 3,
  name: 'Client',
  duration: '3 months',
  type: 'fat-loss',
  story: 'Story',
  muscle_start: '40.0',
  muscle_end: '38.0',
  fat_start: '20.0',
  fat_end: '14.0',
  images_json: '["1.jpeg"]',
}), {
  id: 3,
  name: 'Client',
  duration: '3 months',
  type: 'fat-loss',
  story: 'Story',
  muscle: ['40.0', '38.0', 'kg'],
  fat: ['20.0', '14.0', '%'],
  images: ['1.jpeg'],
});

console.log('transformations spec passed');
