const CATEGORIES = new Set(['fat-loss', 'recomposition', 'muscle']);

function finiteMetric(value, label, maximum) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(`${label} must be a number between 0 and ${maximum}.`);
  }
  const metric = Number(value);
  if (!Number.isFinite(metric) || metric < 0 || metric > maximum) {
    throw new Error(`${label} must be a number between 0 and ${maximum}.`);
  }
  return metric.toFixed(1);
}

export function normalizeTransformation(body) {
  const name = String(body?.name || '').trim();
  const duration = String(body?.duration || '').trim();
  const type = String(body?.type || '').trim();
  const story = String(body?.story || '').trim();
  if (!Array.isArray(body?.images) || !body.images.every((image) => typeof image === 'string')) {
    throw new Error('Gallery image paths must be provided as a list of strings.');
  }
  const images = body.images.map((image) => image.trim()).filter(Boolean);

  if (!name || name.length > 120) throw new Error('Name is required and must be 120 characters or fewer.');
  if (!duration || duration.length > 80) throw new Error('Duration is required and must be 80 characters or fewer.');
  if (!CATEGORIES.has(type)) throw new Error('Choose a valid transformation category.');
  if (!story || story.length > 2000) throw new Error('Story is required and must be 2000 characters or fewer.');
  if (images.length < 1 || images.length > 20) throw new Error('Add between 1 and 20 gallery image paths.');
  for (const image of images) {
    if (
      image.length > 500
      || image.startsWith('/')
      || image.includes('\\')
      || image.split('/').includes('..')
      || /^[a-z][a-z\d+.-]*:/i.test(image)
    ) {
      throw new Error('Image paths must be relative paths without protocols or parent-directory segments.');
    }
  }

  return {
    name,
    duration,
    type,
    story,
    muscleStart: finiteMetric(body.muscleStart, 'Starting muscle mass', 1000),
    muscleEnd: finiteMetric(body.muscleEnd, 'Ending muscle mass', 1000),
    fatStart: finiteMetric(body.fatStart, 'Starting body fat', 100),
    fatEnd: finiteMetric(body.fatEnd, 'Ending body fat', 100),
    images,
  };
}

export function transformationFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    duration: row.duration,
    type: row.type,
    story: row.story,
    muscle: [row.muscle_start, row.muscle_end, 'kg'],
    fat: [row.fat_start, row.fat_end, '%'],
    images: JSON.parse(row.images_json),
  };
}
