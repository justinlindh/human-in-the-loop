// Art review is opt-in, independently of the company's simulation era.
const query = new URLSearchParams(globalThis.location?.search ?? '');
export const ERA_ART_PREVIEW = query.has('eras') && query.get('eraArt') === 'dotcom';
export const ERA_ART_MODELS = ERA_ART_PREVIEW ? ['era_crt_desk', 'era_cubicle', 'era_sock_billboard'] : [];
