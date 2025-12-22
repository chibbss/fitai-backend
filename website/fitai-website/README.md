# fit.ai Website

This directory contains the official fit.ai marketing website.

## Structure

- `index.html` - Main landing page (homepage)
- `signup.html` - Waitlist signup page
- `thank-you.html` - Post-signup confirmation page
- `faq.html` - Frequently Asked Questions
- `pricing.html` - Pricing information
- `contact.html` - Contact page
- `privacy.html` - Privacy Policy
- `terms.html` - Terms of Service
- `logo.svg` - fit.ai logo used in the header
- `images/` - Screenshot assets for chat, workout logging, and calendar/stats

## Deployment

This website is designed to be deployed to `fitailive.com` via Render Static Site.

### Render Configuration:
- **Publish Directory:** `website/fitai-website`
- **Build Command:** (leave empty - no build needed)
- **Branch:** (your main branch)

All internal links are relative and work within this directory structure.

## Notes

- All pages use relative paths for internal navigation
- Logo is referenced as `logo.svg` (relative path). For the full logo pack and brand guide (including dark/light variants and app icons), see `../../logo/README.md`.
- External links (social media, etc.) use absolute URLs
- SEO meta tags are configured for fit.ai branding

