---
description: Use this template to generate a detailed project description for your game design document. This will help you clarify your vision and communicate it effectively to your team. Also for initializing the project source code
# applyTo: 'Describe when these instructions should be loaded' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---
### 1. Game Concept & Overview

* **Title:** The Price War (Working Title)
* **Genre:** Educational Multiplayer Real-Time Strategy / Economic Simulator
* **Platform:** Web-based (Mobile-first for Players, Desktop-optimized for Presenter).
* **Core Loop:** Players start as equal independent producers. Over 3 rounds, they must set prices to clear market demand. The system mathematically forces bankruptcies, pushing survivors to buy tech patents, eventually culminating in a monopoly/cartel phase.
* **Win Condition:** Accumulate a net worth of **5,000 Coins** by the end of Round 3.

---

### 2. Core Game Mechanics & State Management

The game is strictly controlled by the Presenter (Game Master). Players cannot advance until the Presenter triggers the next phase.

* **Round 1 (Free Competition):**
  * Minimum Price Input: `11`
  * Demand Formula: `(Total Players * 100) / 2`


* **Round 2 (Tech & Concentration of Capital):**
  * Tech Patent Cost: `600` (Reduces production cost from 10 to 5).
  * Patent Limit: `Remaining Players / 2` (rounded down).
  * Demand Formula: `(Patents * 100) + 200`
  * Minimum Price Input: `6` (if Patent holder), `11` (if no Patent).


* **Round 3 (Monopoly/Cartelization):**
  * Demand Formula: `Remaining Players * 100`
  * Price Ceiling: `50` (Troll bids above this are set to 0 sales).

---

### 2.1. The Presenter View (Designed for Desktop / Classroom Projector)

The Presenter dashboard is the "Game Master" control panel. It is designed to be projected onto a large screen so the entire class can watch the macroeconomic shifts happen in real-time.

**What the Presenter can DO (Actions):**

* **Initialize the Game:** Generate a unique 4-digit Room Code.
* **Control the Flow of Time:** Click master buttons to advance the game states (`Start Round 1`, `End Round 1`, `Open Patent Shop`, `Start Round 2`, etc.). Players literally cannot do anything on their phones until the Presenter clicks these buttons.

**What is DISPLAYED on the Projector:**

* **Lobby Phase:** A large QR code, the Room Code, the Win Condition ("Goal: Reach 5,000 Coins"), and a live-updating grid of student names as they join.
* **During Bidding:** A dramatic countdown timer. A live counter showing how many students have submitted their bids (e.g., "28 / 30 Bids Received"). *Crucially, it does NOT show what prices they are submitting to prevent screen-cheating.*
* **Post-Round Results (The Core Visual):** * A massive, animated **Bar Chart** ranking all surviving players by their total Cash.
  * When a round ends, the bars violently animate—winners' bars shoot up, while bankrupt players' bars drop to zero, turn red, and drop off the bottom of the chart.
  * Icons next to player names showing who acquired a "Tech Patent" in Round 2.




---

### 2.2 The Player View (Designed for Mobile Web)

The Player view is a lightweight, distraction-free mobile interface. It changes dynamically based entirely on what state the Presenter has triggered.

**What the Player can DO (Actions):**

* **Join:** Enter the 4-digit Room Code and their Name.
* **Submit Bid:** Type a numerical price into an input field and click "Submit". (They can update their bid as many times as they want before the Presenter's timer runs out; the database only keeps the final submission).
* **Buy Patent (Round 2 Only):** Click a highly visible "Buy Tech Patent (600 Coins)" button. This is a "fastest finger first" action—once the global limit is reached, the button disables for everyone else.

**What is DISPLAYED on their Phone (By Game State):**

* **State 1: Waiting / Standby:**
  * A simple screen: *"Waiting for the Presenter to start the next phase..."*
  * A header showing their current stats: **Name**, **Cash Balance**, and  **Production Cost** (starts at 10).


* **State 2: Active Bidding Phase:**
  * A stock up product button that create 100 product units and deduce player balance by 1000 coins (500 if they bought the patent)
  * A large, centered number input field.
  * Dynamic helper text enforcing the rules: *"Tips: To make profits, bid 11 or higher"* (If they bought the patent, this dynamically changes to: *"Tips: To make profits, bid 6 or higher.."*)
  * A countdown timer perfectly synced with the projector.


* **State 3: The Patent Shop (Pre-Round 2):**
  * A flash sale screen: *"NEW TECHNOLOGY INVENTED. Lowers cost to 5. Cost: 600 Cash."*
  * A live counter: *"Patents Remaining: 3 / 7"*.


* **State 4: Post-Round Resolution:**
  * *If they survived/won:* The screen flashes **Green**. Shows a mini-receipt: "Units Sold: 100 | Revenue: +[X] | Net Profit: [Y] | New Balance: [Z]".
  * *If they failed/bankrupted (caused by having their balance deduced to 0 or not having enough balance to stock up exactly 100 products):* The screen flashes **Red** and locks permanently. Text reads: *"BANKRUPT. Your capital was destroyed by market competition. You are now part of the Proletariat. Please look at the projector."*

### 3. Technical Architecture

This architecture delegates tasks to the technologies best suited for them, eliminating the need for a separate, traditional backend server:

* **Frontend (Next.js Client Components):** Handles all user interfaces, countdown timers, and real-time state rendering.
* **Game Engine & Logic (Next.js Server Actions):** Acts as the authoritative game engine. It securely executes market clearing logic, handles round transitions, and prevents cheating directly on the server without exposing logic to the browser.
* **Database & Real-time Broker (Supabase):** Stores the persistent state (PostgreSQL), handles atomic transactions via RPCs (Remote Procedure Calls), and broadcasts WebSocket events to the Next.js clients instantly when data changes.

#### A. Frontend UI (Next.js Client Components)

* **Presenter Dashboard (`/presenter/[roomId]`):**
* Displays the Room Code.
* Shows live, animated bar charts of player capital.
* Houses the "Start Round," "End Round," and "Trigger Tech Upgrade" control buttons.


* **Player Client (`/play/[roomId]`):**
* Mobile-responsive UI.
* States: Lobby (Waiting), Bidding (Input form with countdown), Result (Green/Red screens based on survival), and Upgrade Shop.



#### B. Game Engine API (Next.js Server Actions & Supabase RPCs)

Instead of stateless REST APIs, the frontend calls secure, asynchronous Next.js Server Actions.

* `createRoom()`: Generates a room code and initializes the `rooms` table.
* `joinRoom(roomId, playerName)`: Inserts a new player into the `players` table.
* `startRound(roomId, roundNumber)`: Updates room status, deducts production costs from all active players, and opens bidding.
* `submitBid(roomId, playerId, price)`: Validates input constraints server-side (e.g., rejecting troll bids or invalid minimums) and inserts into the `bids` table.
* `resolveRound(roomId, currentDemand)`: The core engine. It fetches all bids, sorts them, calculates who won the `current_demand`, updates the `players` cash balances, and flags losers as bankrupt.
* **Supabase RPC:** `buy_patent(player_id)`: A custom PostgreSQL function running directly on the database to handle race conditions. It atomically checks if `patents_sold < patents_available`, deducts 600 cash, sets `has_patent = true`, and increments `patents_sold`.

#### C. Real-Time Sync (Supabase)

You leverage Supabase's built-in `pg_changes` Realtime API.

* When a Next.js Server Action finishes calculating (like `resolveRound`) and updates the PostgreSQL database, Supabase instantly fires WebSocket events to all connected Next.js clients, telling them to update their screens without requiring page refreshes.

---

### 4. Database Schema (Supabase PostgreSQL)

To ensure security in a serverless environment, Row Level Security (RLS) policies must be enabled so players cannot query the `bids` table to see competitors' prices.

**Table: `rooms**`

* `id` (UUID, Primary Key)
* `room_code` (String, e.g., "A4B2")
* `status` (Enum: `LOBBY`, `ROUND_1_BIDDING`, `ROUND_1_RESULTS`, etc.)
* `current_demand` (Integer)
* `patents_available` (Integer)
* `patents_sold` (Integer, Default: 0)

**Table: `players**`

* `id` (UUID, Primary Key)
* `room_id` (Foreign Key -> `rooms.id`)
* `name` (String)
* `cash` (Integer, Default: 1000)
* `has_patent` (Boolean, Default: false)
* `is_bankrupt` (Boolean, Default: false)

**Table: `bids**` (Stores the actions for the current round)

* `id` (UUID, Primary Key)
* `room_id` (Foreign Key -> `rooms.id`)
* `player_id` (Foreign Key -> `players.id`)
* `round_number` (Integer)
* `price_submitted` (Integer)
* `submitted_at` (Datetime)
* `units_sold` (Integer, populated by Next.js after resolution)

---

### 5. The Data Flow (How a Round Works)

1. **Start:** The Presenter clicks "Start Round 1" on the Next.js UI.
2. **Server Action Execution:** Next.js securely calls the `startRound` Server Action. This updates the `rooms` table status to `ROUND_1_BIDDING` and deducts 1000 cash from all active players in the `players` table.
3. **Real-time Sync:** Supabase detects the database changes and broadcasts a WebSocket message to all Player phones. Their screens automatically change from "Waiting" to the "Input Price" form.
4. **Action:** Players click "Stock Up" and type a number, hitting submit. The Next.js Server Action `submitBid` validates the price and saves it to the `bids` table.
5. **Resolution:** The 30-second timer hits zero. The Presenter clicks "End Round".
6. **The Engine:** The `resolveRound` Server Action runs on the Next.js server. It fetches all bids, sorts them from lowest to highest, calculates who won the `current_demand`, updates the `players` cash balances, and sets `is_bankrupt = true` for anyone who hit 0 cash.
7. **Final Sync:** Supabase broadcasts the final DB state. The Presenter dashboard bar chart animates the new wealth distribution, and players' phones reactively display their Win/Bankrupt screens based on the new database state.


