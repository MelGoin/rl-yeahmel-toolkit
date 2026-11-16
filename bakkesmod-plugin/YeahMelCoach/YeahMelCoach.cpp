#include "pch.h"
#include "YeahMelCoach.h"

#include <cstdio>

BAKKESMOD_PLUGIN(YeahMelCoach, "YeahMel Coach - shot speed practice HUD", plugin_version,
                 PLUGINTYPE_FREEPLAY | PLUGINTYPE_CUSTOM_TRAINING)

std::shared_ptr<CVarManagerWrapper> _globalCvarManager;

// Rocket League measures speed in Unreal Units per second. 1 UU = 1 cm,
// so multiplying by 0.036 converts to km/h. (Use 0.02237 for mph.)
static constexpr float UU_TO_KPH = 0.036f;

void YeahMelCoach::onLoad()
{
	_globalCvarManager = cvarManager;

	// ---- settings you can change in the F2 menu or the F6 console ----
	hudEnabled = std::make_shared<bool>(true);
	hudX = std::make_shared<float>(0.02f);
	hudY = std::make_shared<float>(0.35f);
	cvarManager->registerCvar("yeahmel_hud", "1", "Show the YeahMel Coach HUD", true, true, 0, true, 1).bindTo(hudEnabled);
	cvarManager->registerCvar("yeahmel_hud_x", "0.02", "HUD position from the left (0-1)", true, true, 0, true, 1).bindTo(hudX);
	cvarManager->registerCvar("yeahmel_hud_y", "0.35", "HUD position from the top (0-1)", true, true, 0, true, 1).bindTo(hudY);

	// Type "yeahmel_reset" in the F6 console to clear your session stats.
	cvarManager->registerNotifier("yeahmel_reset", [this](std::vector<std::string>) { ResetStats(); },
		"Reset YeahMel Coach session stats", PERMISSION_ALL);

	// ---- game events ----
	// Fires the moment a car touches the ball. The ball hasn't sped up yet,
	// so we wait a tenth of a second and then measure it.
	gameWrapper->HookEventPost("Function TAGame.Car_TA.OnHitBall", [this](std::string) { OnBallTouched(); });
	gameWrapper->HookEvent("Function TAGame.Ball_TA.OnHitGoal", [this](std::string) { OnGoal(); });

	// Draw our HUD every frame.
	gameWrapper->RegisterDrawable([this](CanvasWrapper canvas) { Render(canvas); });

	LOG("YeahMel Coach loaded. Go hit some shots in Free Play.");
}

void YeahMelCoach::onUnload()
{
	// BakkesMod removes our hooks, cvars and drawables automatically.
}

bool YeahMelCoach::InPractice()
{
	return gameWrapper->IsInFreeplay() || gameWrapper->IsInCustomTraining();
}

float YeahMelCoach::BallSpeedKph()
{
	ServerWrapper server = gameWrapper->GetCurrentGameState();
	if (!server) return 0.f;
	BallWrapper ball = server.GetBall();
	if (!ball) return 0.f;
	return ball.GetVelocity().magnitude() * UU_TO_KPH;
}

void YeahMelCoach::OnBallTouched()
{
	if (!InPractice()) return;
	touches++;

	gameWrapper->SetTimeout([this](GameWrapper*) {
		float kph = BallSpeedKph();
		lastShotKph = kph;
		if (kph > bestShotKph + 0.5f && kph > 40.f) {
			bestShotKph = kph;
			char msg[64];
			std::snprintf(msg, sizeof(msg), "New best shot: %.0f km/h", kph);
			gameWrapper->Toast("YeahMel Coach", msg, "default", 2.5f);
		}
	}, 0.1f);
}

void YeahMelCoach::OnGoal()
{
	if (!InPractice()) return;
	goals++;
}

void YeahMelCoach::ResetStats()
{
	lastShotKph = bestShotKph = 0.f;
	touches = goals = 0;
	LOG("YeahMel Coach stats reset.");
}

void YeahMelCoach::Render(CanvasWrapper canvas)
{
	if (!*hudEnabled || !InPractice()) return;

	const Vector2 screen = canvas.GetSize();
	const float scale = screen.Y / 1080.f; // looks the same at 1080p, 1440p, 4K
	const Vector2F origin{ screen.X * *hudX, screen.Y * *hudY };
	const Vector2F size{ 300.f * scale, 168.f * scale };

	// background panel
	canvas.SetColor((char)10, (char)12, (char)18, (char)200);
	canvas.SetPosition(origin);
	canvas.FillBox(size);

	// gold accent bar
	canvas.SetColor((char)245, (char)197, 66, (char)255);
	canvas.SetPosition(origin);
	canvas.FillBox(Vector2F{ 4.f * scale, size.Y });

	auto line = [&](float y, const std::string& text, float textScale) {
		canvas.SetPosition(Vector2F{ origin.X + 16.f * scale, origin.Y + y * scale });
		canvas.DrawString(text, textScale * scale, textScale * scale, true);
	};

	char buf[64];
	canvas.SetColor((char)245, (char)197, 66, (char)255);
	line(10, "YEAHMEL COACH", 1.4f);

	canvas.SetColor((char)255, (char)255, (char)255, (char)255);
	std::snprintf(buf, sizeof(buf), "Last shot  %.0f km/h", lastShotKph);
	line(42, buf, 1.6f);
	std::snprintf(buf, sizeof(buf), "Best shot  %.0f km/h", bestShotKph);
	line(76, buf, 1.6f);

	canvas.SetColor((char)170, (char)178, (char)196, (char)255);
	std::snprintf(buf, sizeof(buf), "Touches %d   Goals %d", touches, goals);
	line(112, buf, 1.2f);
	std::snprintf(buf, sizeof(buf), "Ball now %.0f km/h", BallSpeedKph());
	line(136, buf, 1.2f);
}

// ---- F2 > Plugins > YeahMel Coach settings tab ----
void YeahMelCoach::RenderSettings()
{
	ImGui::TextUnformatted("YeahMel Coach - practice shot-speed HUD (Free Play / Custom Training)");
	ImGui::Separator();

	CVarWrapper enabled = cvarManager->getCvar("yeahmel_hud");
	if (enabled) {
		bool on = enabled.getBoolValue();
		if (ImGui::Checkbox("Show HUD", &on)) enabled.setValue(on ? 1 : 0);
	}

	CVarWrapper x = cvarManager->getCvar("yeahmel_hud_x");
	CVarWrapper y = cvarManager->getCvar("yeahmel_hud_y");
	if (x && y) {
		float fx = x.getFloatValue(), fy = y.getFloatValue();
		if (ImGui::SliderFloat("HUD left/right", &fx, 0.f, 0.85f)) x.setValue(fx);
		if (ImGui::SliderFloat("HUD up/down", &fy, 0.f, 0.85f)) y.setValue(fy);
	}

	ImGui::Text("Session: best %.0f km/h, %d touches, %d goals", bestShotKph, touches, goals);
	if (ImGui::Button("Reset session stats")) {
		gameWrapper->Execute([this](GameWrapper*) { ResetStats(); });
	}
}
