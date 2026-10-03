# Product: AnswerDesk for Hearth & Co.

Derived from CLAUDE.md and the brief. Assumptions are labeled.

## What it is
A homepage for a fictional US home-goods store, Hearth & Co., with a chat
widget that answers customer policy questions from the store's policy
document. The widget cites the policy section it used and hands off to a
human when the policy does not cover the question.

## Users
- Shoppers on the store homepage, mostly on phones, with a short question
  about shipping, returns, warranty, or orders.
- Assumption: no account, no history. Each visit is a fresh conversation.

## Primary job
Answer a policy question in under a minute, or send the shopper to a human.
The homepage sets the scene for the store; the widget does the work.

## Mode
Persuade for the homepage (the store is the product); Operate for the widget
(a bounded task: ask, read, leave).

## Visual direction (pinned by CLAUDE.md and SalesPulse DESIGN.md)
- Light theme only. Flat surfaces. Borders and tint carry state, not shadows.
- One accent: Pulse Emerald #0F7A4D, hover #0C6540.
- Ink #14161A for text, Muted #4B5563 and #6B7280 for secondary text.
- Page #FAFAF9, surface #FFFFFF, border #E4E6EA.
- Error tint #FEF6F5 with border #FDA29B and text #D92D20, state only.
- System font stack only. No webfont loading.
- Radius: 8px for buttons, inputs, and chips; 14px for panels and cards.

## Constraints
- Homepage must not compete with the widget: the widget is the only
  floating, high-contrast element.
- Copy is plain and specific. No em dashes in visible text.
- Accessibility: visible focus rings in emerald, 4.5:1 text contrast,
  reduced-motion respected.

## Assumptions to confirm
- Product photography is placeholder (Picsum seeds). Real photos needed.
- Product names and prices are invented for the demo.
- Store address is Portland, Oregon, from the policy document.
