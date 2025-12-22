# Render Static Site Deployment Guide

## Quick Setup

1. **Go to Render Dashboard** → **New** → **Static Site**

2. **Connect GitHub Repository**
   - Select your repository: `chibbss/fitai-backend`
   - Choose the branch (usually `main` or `feature/add-frontend`)

3. **Configure Settings:**
   - **Name:** `fitai-website` (or your preferred name)
   - **Publish Directory:** `website/fitai-website`
   - **Build Command:** (leave empty - no build needed)
   - **Branch:** (your main branch)

4. **Custom Domain:**
   - After deployment, go to **Settings** → **Custom Domains**
   - Add `fitailive.com`
   - Follow Render's DNS instructions to point your domain

5. **Deploy!**
   - Click **Create Static Site**
   - Render will automatically deploy your site

## What Gets Deployed

- `index.html` - Main landing page (homepage)
- `signup.html` - Waitlist signup
- `thank-you.html` - Post-signup confirmation
- `faq.html` - FAQ page
- `pricing.html` - Pricing information
- `contact.html` - Contact page
- `privacy.html` - Privacy Policy
- `terms.html` - Terms of Service
- `logo.svg` - fit.ai logo

## Post-Deployment Checklist

- [ ] Verify `fitailive.com` loads correctly
- [ ] Test all internal links
- [ ] Verify logo displays correctly
- [ ] Test signup form (if backend integrated)
- [ ] Check mobile responsiveness
- [ ] Verify SEO meta tags
- [ ] Test custom domain SSL certificate

## Notes

- All internal links use relative paths (e.g., `href="signup.html"`)
- Logo is referenced as `logo.svg` (relative path)
- No build process required - pure HTML/CSS/JS
- Render will automatically handle HTTPS/SSL

