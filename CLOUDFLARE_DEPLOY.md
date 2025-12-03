# Cloudflare Pages Configuration

## Build Settings

- **Framework preset**: Next.js
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Root directory**: `/`
- **Node version**: 18.x or higher

## Environment Variables

Add these in Cloudflare Pages dashboard when integrating external services:

```
# Supabase (when ready)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Cloudinary (when ready)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
```

## Deployment Steps

1. Push code to GitHub
2. Go to Cloudflare Pages dashboard
3. Connect your GitHub repository
4. Configure build settings as above
5. Deploy!

## Notes

- The app uses Next.js static export compatible features
- Images are set to `unoptimized: true` for compatibility
- TypeScript build errors are ignored for faster builds (can be changed later)
