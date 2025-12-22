# Beta Tester Tracking Template

## Google Sheets Template

Create a Google Sheet with these columns for tracking your 20 beta testers.

### Column Structure

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| **Name** | Text | Tester's name | John Doe |
| **Email** | Text | Email address | john@example.com |
| **Platform** | Dropdown | iOS / Android / Both | iOS |
| **Device Model** | Text | Device info | iPhone 15 Pro |
| **Form Submitted** | Checkbox | Has submitted form? | ✅ |
| **Form Submission Date** | Date | When they submitted | 2025-12-01 |
| **DM Sent** | Checkbox | Have we sent DM? | ✅ |
| **DM Date** | Date | When DM was sent | 2025-12-01 |
| **Beta Link Sent** | Checkbox | Have we sent beta link? | ✅ |
| **Link Sent Date** | Date | When link was sent | 2025-12-01 |
| **App Installed** | Checkbox | Have they installed? | ✅ |
| **Install Date** | Date | When they installed | 2025-12-02 |
| **Onboarding Complete** | Checkbox | Completed onboarding? | ✅ |
| **Onboarding Date** | Date | When completed | 2025-12-02 |
| **First Workout Logged** | Checkbox | Logged first workout? | ✅ |
| **First Workout Date** | Date | When logged | 2025-12-03 |
| **First Chat** | Checkbox | Had first chat? | ✅ |
| **Status** | Dropdown | Current status | Active |
| **Feedback Count** | Number | How many feedback items? | 3 |
| **Bug Reports** | Number | How many bugs reported? | 1 |
| **Last Active** | Date | Last activity date | 2025-12-05 |
| **Notes** | Text | Any notes | "Loving the chat feature!" |

### Status Options

Create a dropdown for the **Status** column with these options:

- **Pending** - Form not submitted yet
- **Invited** - Form submitted, beta link sent
- **Installed** - App installed, not started onboarding
- **Onboarding** - Currently in onboarding
- **Active** - Using the app regularly
- **Stuck** - Needs help (not progressing)
- **Inactive** - Not using the app
- **Completed** - Finished beta period

### Conditional Formatting

Apply these color rules to the **Status** column:

- **Pending** → Yellow
- **Invited** → Light Blue
- **Installed** → Blue
- **Onboarding** → Orange
- **Active** → Green
- **Stuck** → Red
- **Inactive** → Gray
- **Completed** → Dark Green

### Formulas (Optional)

Add these formulas to track progress:

**Total Active Testers:**
```
=COUNTIF(Status:Status, "Active")
```

**Onboarding Completion Rate:**
```
=COUNTIF(Onboarding Complete:Onboarding Complete, TRUE) / COUNTIF(Form Submitted:Form Submitted, TRUE)
```

**Average Time to First Workout:**
```
=AVERAGE(First Workout Date:First Workout Date) - AVERAGE(Install Date:Install Date)
```

### Sample Data

| Name | Email | Platform | Form Submitted | Status | Notes |
|------|-------|----------|----------------|--------|-------|
| John Doe | john@example.com | iOS | ✅ | Active | Very engaged, great feedback |
| Jane Smith | jane@example.com | Android | ✅ | Onboarding | Just installed |
| Bob Wilson | bob@example.com | iOS | ⏳ | Pending | Waiting for form submission |

### Weekly Review Template

Create a separate sheet for weekly reviews:

| Week | Date | Active Testers | Onboarding Complete | First Workouts | Bug Reports | Feedback Items | Key Insights |
|------|------|----------------|---------------------|----------------|-------------|----------------|--------------|
| Week 1 | 2025-12-01 | 15 | 12 | 8 | 3 | 10 | Most users love the chat feature |
| Week 2 | 2025-12-08 | 18 | 18 | 15 | 5 | 15 | Workout logging needs improvement |

---

*Last updated: November 30, 2025*

