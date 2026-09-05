# Fight Night Fantasy

A UFC pick'em app for predicting fight outcomes with friends.

## What it does

- Pick the winner, method (KO/TKO, submission, decision), and round for every fight on a UFC main card
- Picks lock automatically once a fight starts
- Scores calculate automatically and leaderboards update as events happen
- Bonus points for a perfect pick (winner + method + round all correct)

## Features

- Global, per-event, and season-long leaderboards
- Private groups, so you can run pick'em with friends instead of the whole platform
- (In progress) A fight outcome prediction model, being built from scratch as its own project, that will eventually feed into the app

## Status

Actively in progress, not a finished product. Current focus:

- Core pick flow and home screen
- Redesigning the pick grid (the round-by-round grid per fighter is the main visual centerpiece of the app)
- Locking in a live UFC data source for fight cards and results

## Tech stack

- React Native + Expo (mobile, iOS-first MVP)
- Firebase (auth, data, scoring)

## Why I'm building it

I wanted to build something real from scratch on my own, in something I actually care about instead of another tutorial project. UFC pick'em with friends is something I already do informally, so I figured I'd build the actual product for it. It's also meant to eventually plug into a fight prediction model I'm building separately, so the picks in the app can eventually be backed by real data instead of just gut feel.
