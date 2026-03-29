export interface ShowcaseExample {
  id: string;
  video_url: string | null;
  cover_url: string | null;
  prompt: string | null;
  before_image_url: string | null;
  display_order: number;
}

export const SHOWCASES: ShowcaseExample[] = [
  {
    id: '65d20e2c-bb88-45f5-bd6c-040dc4f89cf3',
    video_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-video-1773995189841.mp4',
    cover_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-cover-1773995190094.jpg',
    prompt: 'Generate a 3D robot animation',
    before_image_url: null,
    display_order: 0,
  },
  {
    id: '359b0c75-147f-4f12-a7a4-0cf001ba9519',
    video_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-video-1773994371245.mp4',
    cover_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-cover-1773994371512.jpg',
    prompt: 'Generate a cute 3D robot animation in space',
    before_image_url: null,
    display_order: 1,
  },
  {
    id: '87af5f08-dac1-4457-8a1a-485a9529f1b9',
    video_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-video-1773994552035.mp4',
    cover_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-cover-1773994552367.jpg',
    prompt: 'Generate an ad for this product',
    before_image_url: 'https://data.aixio.app/storage/v1/object/public/posts/dd439068-ae1a-4a57-985b-3ae000aad852/showcase-before-1773994552673.jpg',
    display_order: 2,
  },
];
