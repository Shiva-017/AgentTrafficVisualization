import os, time, json, requests, re
from datetime import datetime

# Optional AutoGen usage for reasoning/advice
USE_AUTOGEN = True
try:
	from autogen import AssistantAgent, UserProxyAgent
except Exception:
	USE_AUTOGEN = False

ATC_URL = os.getenv("ATC_URL", "http://localhost:3000")
ATC_KEY = os.getenv("ATCPRO_INGEST_API_KEY")
# No API key needed for Open-Meteo
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PROMPT = os.getenv("PROMPT", "what is the weather in San Francisco and what should I wear?")

# Simple local state to compute metrics
ITEMS_TOKENS = { 'PLAN': 0.0, 'FETCH': 0.0, 'WRITE': 0.0 }
AGENTS_ALIVE = set()


def post(msg: dict):
	assert ATC_KEY, "ATCPRO_INGEST_API_KEY not set"
	r = requests.post(f"{ATC_URL}/api/ingest", headers={
		"Authorization": f"Bearer {ATC_KEY}",
		"Content-Type": "application/json",
	}, data=json.dumps(msg), timeout=15)
	r.raise_for_status()


def sum_tokens():
	return float(ITEMS_TOKENS.get('PLAN',0)) + float(ITEMS_TOKENS.get('FETCH',0)) + float(ITEMS_TOKENS.get('WRITE',0))


def make_metrics(live_tps: float):
	return {
		"active_agents": len(AGENTS_ALIVE),
		"total_tokens": sum_tokens(),
		"total_spend_usd": 0,
		"live_tps": max(0.0, float(live_tps)),
		"live_spend_per_s": 0,
		"completion_rate": 0,
	}


def snapshot(task: str):
	post({
		"type": "snapshot",
		"state": {
			"items": {
				"PLAN":  {"id":"PLAN","group":"P","sector":"Plan","depends_on":[],"desc":f"Plan: {task}","estimate_ms":2000,"tps_min":1,"tps_max":3,"tps":1,"tokens_done":0,"est_tokens":8,"status":"assigned"},
				"FETCH": {"id":"FETCH","group":"R","sector":"Fetch","depends_on":["PLAN"],"desc":"Get weather data","estimate_ms":2200,"tps_min":1,"tps_max":3,"tps":1,"tokens_done":0,"est_tokens":8,"status":"queued"},
				"WRITE": {"id":"WRITE","group":"W","sector":"Write","depends_on":["FETCH"],"desc":"Summarize advice","estimate_ms":2200,"tps_min":1,"tps_max":3,"tps":1,"tokens_done":0,"est_tokens":8,"status":"queued"},
			},
			"agents": {},
			"metrics": make_metrics(0),
			"seed": "autogen-weather",
			"running": True,
		}
	})


def tick(tick_id: int, items=None, agents=None, metrics=None, agents_remove=None):
	msg = {"type":"tick","tick_id":tick_id}
	if items:
		# update local tokens for metrics
		for p in items:
			try:
				if p.get('id') in ITEMS_TOKENS and 'tokens_done' in p:
					ITEMS_TOKENS[p['id']] = float(p['tokens_done'])
			except Exception:
				pass
		msg["items"] = items
	if agents:
		for a in agents:
			if a and a.get('id'): AGENTS_ALIVE.add(a['id'])
		msg["agents"] = agents
	if agents_remove:
		for aid in agents_remove:
			if aid in AGENTS_ALIVE: AGENTS_ALIVE.discard(aid)
		msg["agents_remove"] = agents_remove
	# always attach metrics to keep UI live
	msg["metrics"] = metrics if metrics is not None else make_metrics(0)
	post(msg)


def extract_city(prompt: str) -> str:
	# naive extraction of city as words after "in "
	m = re.search(r"in ([A-Za-z\s]+?)(\?|$|\.|,)", prompt, re.IGNORECASE)
	if m:
		return m.group(1).strip()
	return "San Francisco"


def geocode_city(city: str):
	# Open-Meteo free geocoding
	r = requests.get(
		"https://geocoding-api.open-meteo.com/v1/search",
		params={"name": city, "count": 1}, timeout=20
	)
	if r.status_code != 200:
		return None
	data = r.json()
	if not data or not data.get("results"):
		return None
	res = data["results"][0]
	return {
		"name": res.get("name", city),
		"latitude": res.get("latitude"),
		"longitude": res.get("longitude"),
		"country": res.get("country", ""),
	}


def open_meteo_current(lat: float, lon: float):
	r = requests.get(
		"https://api.open-meteo.com/v1/forecast",
		params={
			"latitude": lat,
			"longitude": lon,
			"current": "temperature_2m,wind_speed_10m",
			"hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m",
		},
		timeout=20,
	)
	r.raise_for_status()
	return r.json()


def gemini_advice(context: str) -> str:
	if not GEMINI_API_KEY:
		return ""
	try:
		resp = requests.post(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
			params={"key": GEMINI_API_KEY},
			headers={"Content-Type": "application/json"},
			data=json.dumps({
				"contents": [{"parts": [{"text": f"Weather context: {context}. Respond with a single friendly sentence including clothing/activity advice."}]}]
			}), timeout=30
		)
		resp.raise_for_status()
		data = resp.json()
		text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
		return text.strip()
	except Exception:
		return ""


def autogen_openai_advice(context: str) -> str:
	if not USE_AUTOGEN or not OPENAI_API_KEY:
		return ""
	try:
		assistant = AssistantAgent(
			name="assistant",
			llm_config={
				"config_list": [{
					"model": "gpt-4o-mini",
					"api_key": OPENAI_API_KEY,
				}]
			}
		)
		user = UserProxyAgent(name="user")
		prompt = f"Weather context: {context}. Respond with a single friendly sentence including clothing/activity advice."
		result = user.initiate_chat(assistant, message=prompt)
		try:
			text = str(result.get("chat_history", [])[-1].get("content", "")).strip()
		except Exception:
			text = str(result)
		return text.strip()
	except Exception:
		return ""


def heuristic_advice(temp_c: float, wind_ms: float) -> str:
	try:
		if temp_c is None: return "Dress comfortably and carry a light layer."
		if temp_c >= 28: base = "It's hot—wear light, breathable clothing and stay hydrated."
		elif temp_c >= 20: base = "Mild and pleasant—t-shirt or light layer should be fine."
		elif temp_c >= 10: base = "Cool—wear a light jacket or sweater."
		elif temp_c >= 0: base = "Chilly—wear a warm jacket and consider a hat."
		else: base = "Cold—bundle up with a heavy coat, hat, and gloves."
		if wind_ms is not None and wind_ms >= 8:
			base += " It's breezy—add a windproof layer."
		return base
	except Exception:
		return "Dress comfortably and carry a light layer."


def best_advice_from_context(context: str, temp_c: float, wind_ms: float) -> str:
	adv = gemini_advice(context)
	if adv: return adv
	adv = autogen_openai_advice(context)
	if adv: return adv
	return heuristic_advice(temp_c, wind_ms)


def run_from_prompt(prompt: str):
	city = extract_city(prompt)
	place = geocode_city(city) or {"name": city, "latitude": 37.7749, "longitude": -122.4194, "country": ""}
	task = f"{prompt.strip()}"
	snapshot(task)

	# PLAN (short)
	AGENTS_ALIVE.clear(); ITEMS_TOKENS['PLAN']=0; ITEMS_TOKENS['FETCH']=0; ITEMS_TOKENS['WRITE']=0
	tick(1, items=[{"id":"PLAN","status":"in_progress","started_at":int(time.time()*1000),"tps":2,"agent_id":"AG_PLAN"}],
	     agents=[{"id":"AG_PLAN","work_item_id":"PLAN"}], metrics=make_metrics(2))
	ITEMS_TOKENS['PLAN']=4
	time.sleep(0.3)
	tick(2, items=[{"id":"PLAN","tokens_done":ITEMS_TOKENS['PLAN'],"tps":2.2,"eta_ms":1200}], metrics=make_metrics(2.2))
	plan = f"- Identify city: {place['name']}; - Fetch weather via Open-Meteo; - Provide friendly advice"
	time.sleep(0.3)
	tick(3, items=[{"id":"PLAN","status":"done","eta_ms":0,"desc":f"Plan -> {plan}","agent_id":None}],
	     agents_remove=["AG_PLAN"], metrics=make_metrics(0))

	# FETCH
	tick(4, items=[{"id":"FETCH","status":"assigned"}], metrics=make_metrics(0))
	tick(5, items=[{"id":"FETCH","status":"in_progress","started_at":int(time.time()*1000),"tps":2,"agent_id":"AG_FETCH"}],
	     agents=[{"id":"AG_FETCH","work_item_id":"FETCH"}], metrics=make_metrics(2))
	data = open_meteo_current(place["latitude"], place["longitude"])
	cur = data.get("current", {})
	temp = cur.get("temperature_2m")
	wind = cur.get("wind_speed_10m")
	brief = f"{place['name']}{(', ' + place['country']) if place.get('country') else ''}: {temp}°C, wind {wind} m/s"
	ITEMS_TOKENS['FETCH']=5
	time.sleep(0.4)
	tick(6, items=[{"id":"FETCH","tokens_done":ITEMS_TOKENS['FETCH'],"tps":2.3,"eta_ms":900}], metrics=make_metrics(2.3))
	ITEMS_TOKENS['FETCH']=9
	time.sleep(0.4)
	tick(7, items=[{"id":"FETCH","tokens_done":ITEMS_TOKENS['FETCH'],"tps":2.4,"eta_ms":400}], metrics=make_metrics(2.4))
	time.sleep(0.3)
	tick(8, items=[{"id":"FETCH","status":"done","eta_ms":0,"desc":brief,"agent_id":None}],
	     agents_remove=["AG_FETCH"], metrics=make_metrics(0))

	# WRITE (chat-like with multiple ticks and sustained agent)
	tick(9, items=[{"id":"WRITE","status":"assigned"}], metrics=make_metrics(0))
	tick(10, items=[{"id":"WRITE","status":"in_progress","started_at":int(time.time()*1000),"tps":2.1,"agent_id":"AG_WRITE"}],
	     agents=[{"id":"AG_WRITE","work_item_id":"WRITE"}], metrics=make_metrics(2.1))
	answer = best_advice_from_context(brief, temp, wind)
	ITEMS_TOKENS['WRITE']=4
	time.sleep(0.5)
	tick(11, items=[{"id":"WRITE","tokens_done":ITEMS_TOKENS['WRITE'],"tps":2.0,"eta_ms":1400}], metrics=make_metrics(2.0))
	ITEMS_TOKENS['WRITE']=8
	time.sleep(0.6)
	tick(12, items=[{"id":"WRITE","tokens_done":ITEMS_TOKENS['WRITE'],"tps":2.2,"eta_ms":800,"desc":f"Answer -> {answer}"}], metrics=make_metrics(2.2))
	ITEMS_TOKENS['WRITE']=12
	time.sleep(0.6)
	tick(13, items=[{"id":"WRITE","tokens_done":ITEMS_TOKENS['WRITE'],"tps":2.3,"eta_ms":200,"desc":"Follow-up: Expect variability; check again in a few hours."}], metrics=make_metrics(2.3))
	time.sleep(0.5)
	tick(14, items=[{"id":"WRITE","status":"done","eta_ms":0,"desc":f"Final: {answer}","agent_id":None}],
	     agents_remove=["AG_WRITE"], metrics=make_metrics(0))


if __name__ == "__main__":
	run_from_prompt(PROMPT)
