# Spam SMS Filter

Classifies a text message as **spam** or **not spam** from the words it contains, using the
[SMS Spam Collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection) dataset (5,574 messages).

* **Model:** TF-IDF keyword frequencies (words and word pairs) feeding **Multinomial Naive Bayes** and **Logistic Regression**. Both are tuned with 5-fold cross-validation and the better one is kept.
* **Backend:** Python + Flask API, trains the model, stores every check in **MySQL**.
* **Frontend:** Python + Flask web page. It highlights the words that gave a message away.
* **Colab notebook:** trains the same model in one click (`Runtime > Run all`).

```
spam-sms-filter-backend.zip   ->  backend/
    app.py            Flask API
    spam_core.py      data download, cleaning, training, prediction
    train.py          python train.py  (trains and saves model/model.joblib)
    db.py             MySQL access
    mysql/schema.sql  database + table
    model/            model.joblib and metrics.json go here
    requirements.txt  .env.example  Procfile  render.yaml

spam-sms-filter-frontend.zip  ->  frontend/
    app.py            Flask web server (forwards /api/* to the backend)
    templates/index.html   static/style.css   static/app.js
    requirements.txt  .env.example  Procfile  render.yaml

Spam_SMS_Filter_Training.ipynb   Google Colab notebook
```

You need **Python 3.10 to 3.12**. MySQL is optional for trying the app, and required for the saved history.

---

## 1. Train the model in Google Colab (no setup)

1. Go to <https://colab.research.google.com>, choose **File > Upload notebook**, and select `Spam_SMS_Filter_Training.ipynb`.
2. Click **Runtime > Run all**.
3. When it finishes, `spam_sms_model.zip` downloads automatically. Unzip it and copy `model.joblib` and `metrics.json` into `backend/model/`.

The notebook downloads the dataset itself, shows charts and a confusion matrix, and lets you test your own messages. Expect about 98% accuracy.

> This step is optional. If `backend/model/model.joblib` is missing, the backend trains the model by itself the first time it starts (about a minute, needs internet).

---

## 2. Run locally

### 2.1 MySQL (for saved history)

Install MySQL 8 (or XAMPP / MySQL Workbench) and make sure the server is running. Then create the database:

```bash
cd backend
mysql -u root -p < mysql/schema.sql
```

(The backend also creates the database and table automatically on first start if your MySQL user is allowed to.)
Skip this section to run without history: predictions still work, the "Recent checks" list stays empty.

### 2.2 Backend (port 5000)

```bash
cd backend
python -m venv venv

# Windows (PowerShell / cmd)
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
```

Open `.env` and set your MySQL password (`DB_PASSWORD=`). Then:

```bash
python train.py               # skip if you copied the Colab model into model/
python app.py
```

Check <http://localhost:5000/health>. It should show `"model_loaded": true` and `"database": "connected"`.

### 2.3 Frontend (port 8000)

Open a **second terminal**:

```bash
cd frontend
python -m venv venv
venv\Scripts\activate         # macOS / Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
python app.py
```

Open <http://localhost:8000>. `BACKEND_URL` in `frontend/.env` is already `http://localhost:5000`.

---

## 3. Run online (free: GitHub + Aiven + Render)

Order matters: database first, then backend, then frontend.

### 3.1 Put the code on GitHub

Create **two repositories**, one for the contents of `backend/` and one for the contents of `frontend/` (so `app.py` sits at the top level of each repo). If you used Colab, include `model/model.joblib`; otherwise the backend trains during its build.

### 3.2 MySQL on Aiven

1. Create an account at <https://aiven.io> and create a **MySQL** service (pick the free plan if it is offered).
2. When it is running, copy the **Service URI**. It looks like
   `mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
3. Nothing else to do: the backend creates the `predictions` table on first start. (To do it by hand, run `mysql/schema.sql` from the Aiven console, leaving out the first two lines that create and select a database.)

### 3.3 Backend on Render

1. <https://render.com> > **New > Web Service** > connect the **backend** repo.
2. Settings:
   * **Runtime:** Python 3
   * **Build Command:** `pip install -r requirements.txt && python train.py --if-missing`
   * **Start Command:** `gunicorn app:app --workers 1 --threads 4 --timeout 120`
   * **Environment variables:** `DATABASE_URL` = your Aiven Service URI, and `PYTHON_VERSION` = `3.11.9`
3. Deploy. When it is live, open `https://YOUR-BACKEND.onrender.com/health`.

(`render.yaml` in the repo holds the same settings if you prefer a Blueprint deploy.)

### 3.4 Frontend on Render

1. **New > Web Service** > connect the **frontend** repo.
2. Settings:
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `gunicorn app:app --workers 2 --timeout 120`
   * **Environment variables:** `BACKEND_URL` = `https://YOUR-BACKEND.onrender.com` (no trailing slash), `PYTHON_VERSION` = `3.11.9`
3. Deploy and open the frontend URL.

On Render's free plan, services sleep after a period of no traffic. The first request afterwards can take up to a minute while the backend wakes up; the page tells you when this is happening.

---

## 4. API reference

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/health` | | server, model and database status |
| POST | `/api/predict` | `{"message": "text"}` | label, spam probability, highlighted words, top signals |
| POST | `/api/predict/batch` | `{"messages": ["a", "b"]}` (max 50) | label and probability for each |
| GET | `/api/history` | `?limit=20` | latest saved checks |
| DELETE | `/api/history` | | clears saved checks |
| GET | `/api/stats` | | total, spam and not-spam counts |
| GET | `/api/model-info` | | model name, accuracy, precision, recall, F1, top words |

```bash
curl -X POST http://localhost:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"message": "WINNER! Claim your prize at www.win.com"}'
```

## 5. Settings (`backend/.env`)

| Variable | Meaning | Default |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | local MySQL connection | `localhost`, `3306`, `root`, empty, `spam_filter` |
| `DATABASE_URL` | one-line connection string (Aiven); overrides the `DB_*` values | not set |
| `DB_SSL`, `DB_SSL_CA` | force SSL / path to a CA file | off |
| `SPAM_THRESHOLD` | probability at or above which a message is spam | `0.5` |
| `CORS_ORIGINS` | allowed browser origins, comma separated | `*` |
| `AUTO_TRAIN` | train automatically when no model file exists | `true` |

## 6. Troubleshooting

* **`"database": "disabled"`**: no database settings were found. Create `backend/.env` from `.env.example`.
* **`"database": "unavailable"`**: MySQL is not running, or the password or URL is wrong. Prediction still works.
* **Frontend says "Server offline"**: the backend is not running, or `BACKEND_URL` is wrong.
* **`Could not download the dataset`**: the machine has no internet. Download `SMSSpamCollection` from the UCI page above and put it in `backend/data/`.
* **Model fails to load after copying from Colab**: the scikit-learn versions differ. The backend then retrains automatically; or run `python train.py`.
* **`cryptography` or authentication errors with MySQL 8**: run `pip install -r requirements.txt` again (it installs `cryptography`).

## 7. How it works

1. Each message is cleaned: links, numbers of five or more digits (phone numbers, short codes) and the symbols £ $ € become the tokens `web link`, `long number` and `money symbol`, because these are strong spam signals.
2. The text becomes a TF-IDF vector over words and word pairs, which is a weighted keyword-frequency count.
3. Naive Bayes and Logistic Regression are both trained and tuned; the one with the higher cross-validated F1 is kept.
4. For each message, the weight of every word it contains shows which ones pushed the score toward spam or toward not spam. That is what the frontend highlights.
