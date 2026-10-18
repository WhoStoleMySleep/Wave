//! The app used to ship as Liner under `com.hkamori.liner`. App data and WebView
//! storage (localStorage, IndexedDB) live in folders named after the identifier,
//! so they are moved to the new name before a window opens and reads them.

use std::fs;
use std::path::PathBuf;

const LEGACY_IDENTIFIER: &str = "com.hkamori.liner";
const IDENTIFIER: &str = "com.whostolemysleep.wave";

fn base_dirs() -> Vec<PathBuf> {
    #[allow(unused_mut)]
    let mut candidates = vec![dirs::data_dir(), dirs::data_local_dir(), dirs::cache_dir(), dirs::config_dir()];
    #[cfg(target_os = "macos")]
    candidates.push(dirs::home_dir().map(|home| home.join("Library/WebKit")));
    let mut bases: Vec<PathBuf> = Vec::new();
    for base in candidates.into_iter().flatten() {
        if !bases.contains(&base) {
            bases.push(base);
        }
    }
    bases
}

/// An unbundled dev binary has no bundle id, so on macOS WebKit names its folders after the executable.
fn renames() -> Vec<(&'static str, &'static str)> {
    #[allow(unused_mut)]
    let mut pairs = vec![(LEGACY_IDENTIFIER, IDENTIFIER)];
    #[cfg(all(target_os = "macos", debug_assertions))]
    pairs.push(("liner", "wave"));
    pairs
}

/// Never overwrites: once the new folder exists it holds the newer data, and the legacy one is left alone.
fn move_dirs(bases: &[PathBuf], renames: &[(&str, &str)]) {
    for base in bases {
        for (from, to) in renames {
            let legacy = base.join(from);
            let current = base.join(to);
            if !legacy.is_dir() || current.exists() {
                continue;
            }
            if let Err(err) = fs::rename(&legacy, &current) {
                eprintln!("moving {} to {} failed: {err}", legacy.display(), current.display());
            }
        }
    }
}

pub fn move_legacy_dirs() {
    move_dirs(&base_dirs(), &renames());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wave-legacy-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_legacy_folder_with_its_contents() {
        let base = scratch("move");
        fs::create_dir_all(base.join("old/WebsiteData")).unwrap();
        fs::write(base.join("old/auth-session.json"), "{}").unwrap();
        move_dirs(&[base.clone()], &[("old", "new")]);
        assert!(!base.join("old").exists());
        assert_eq!(fs::read_to_string(base.join("new/auth-session.json")).unwrap(), "{}");
        assert!(base.join("new/WebsiteData").is_dir());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn keeps_existing_new_folder_untouched() {
        let base = scratch("keep");
        fs::create_dir_all(base.join("old")).unwrap();
        fs::create_dir_all(base.join("new")).unwrap();
        fs::write(base.join("new/marker"), "current").unwrap();
        move_dirs(&[base.clone()], &[("old", "new")]);
        assert!(base.join("old").is_dir());
        assert_eq!(fs::read_to_string(base.join("new/marker")).unwrap(), "current");
        fs::remove_dir_all(base).unwrap();
    }
}
