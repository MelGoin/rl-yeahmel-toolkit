#pragma once

#include "GuiBase.h"
#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/pluginwindow.h"
#include "bakkesmod/plugin/PluginSettingsWindow.h"

#include "version.h"
constexpr auto plugin_version = stringify(VERSION_MAJOR) "." stringify(VERSION_MINOR) "." stringify(VERSION_PATCH) "." stringify(VERSION_BUILD);

// YeahMel Coach
// A practice HUD for Free Play and Custom Training:
//   - speed of your last shot
//   - hardest shot of the session
//   - total touches and goals this session
//   - a pop-up when you beat your best shot speed
//
// Runs only offline (Free Play / Custom Training), which is where
// BakkesMod is allowed to run when Easy Anti-Cheat is turned off.
class YeahMelCoach : public BakkesMod::Plugin::BakkesModPlugin,
                     public SettingsWindowBase
{
	// Settings (saved automatically by BakkesMod)
	std::shared_ptr<bool> hudEnabled;
	std::shared_ptr<float> hudX;
	std::shared_ptr<float> hudY;

	// Session stats
	float lastShotKph = 0.f;
	float bestShotKph = 0.f;
	int touches = 0;
	int goals = 0;

	void onLoad() override;
	void onUnload() override;

	bool InPractice();
	float BallSpeedKph();
	void OnBallTouched();
	void OnGoal();
	void ResetStats();
	void Render(CanvasWrapper canvas);

public:
	void RenderSettings() override;
};
