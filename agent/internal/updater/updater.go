package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/sombochea/secops/agent/internal/version"
)

type ghRelease struct {
	TagName string    `json:"tag_name"`
	Assets  []ghAsset `json:"assets"`
}

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// CheckAndUpdate checks GitHub for a newer agent-v* release and replaces the binary.
// Runs in background, logs results. Non-fatal on failure.
func CheckAndUpdate(repo string) {
	go func() {
		// Wait a bit after startup
		time.Sleep(10 * time.Second)
		if err := doUpdate(repo); err != nil {
			log.Printf("[updater] %v", err)
		}
	}()
}

func doUpdate(repo string) error {
	latest, err := fetchLatest(repo)
	if err != nil {
		return fmt.Errorf("check failed: %w", err)
	}

	currentTag := "agent-v" + version.Version
	if latest.TagName == currentTag || latest.TagName == "" {
		log.Printf("[updater] up to date (%s)", currentTag)
		return nil
	}

	// Compare: strip "agent-v" prefix for semver comparison
	latestVer := strings.TrimPrefix(latest.TagName, "agent-v")
	if version.Version != "dev" && latestVer <= version.Version {
		log.Printf("[updater] up to date (%s)", currentTag)
		return nil
	}

	log.Printf("[updater] new version available: %s (current: %s)", latest.TagName, currentTag)

	// Find matching asset
	wantName := fmt.Sprintf("secops-agent-%s-%s", runtime.GOOS, runtime.GOARCH)
	var downloadURL string
	for _, a := range latest.Assets {
		if strings.Contains(a.Name, wantName) {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return fmt.Errorf("no asset for %s/%s in release %s", runtime.GOOS, runtime.GOARCH, latest.TagName)
	}

	// Download to temp file
	log.Printf("[updater] downloading %s", downloadURL)
	resp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot find self: %w", err)
	}

	tmp := exe + ".update"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("write temp: %w", err)
	}
	f.Close()

	// Atomic replace
	old := exe + ".old"
	os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("backup old binary: %w", err)
	}
	if err := os.Rename(tmp, exe); err != nil {
		// Rollback
		os.Rename(old, exe)
		return fmt.Errorf("replace binary: %w", err)
	}
	os.Remove(old)

	log.Printf("[updater] updated to %s — restart the agent to use the new version", latest.TagName)
	return nil
}

func fetchLatest(repo string) (*ghRelease, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	// List releases and find latest agent-v* tag
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases", repo)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var releases []ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, err
	}

	for _, r := range releases {
		if strings.HasPrefix(r.TagName, "agent-v") {
			return &r, nil
		}
	}
	return &ghRelease{}, nil
}
