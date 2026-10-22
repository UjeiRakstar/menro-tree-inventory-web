import { sizedPhoto } from './photoSize.js';

describe('sizedPhoto', () => {
  it('asks Cloudinary for the photo at the width it is shown', () => {
    expect(sizedPhoto('https://res.cloudinary.com/demo/image/upload/v1712/trees/abc.jpg', 400)).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_400,c_limit,f_auto,q_auto/v1712/trees/abc.jpg'
    );
  });

  it('leaves any other address alone', () => {
    expect(sizedPhoto('https://example.org/abc.jpg', 400)).toBe('https://example.org/abc.jpg');
    expect(sizedPhoto(null, 400)).toBe('');
    expect(sizedPhoto('https://res.cloudinary.com/demo/image/upload/v1/abc.jpg')).toBe(
      'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg'
    );
  });
});
