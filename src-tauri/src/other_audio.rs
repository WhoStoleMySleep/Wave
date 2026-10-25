//! Tells the page when another app plays sound, so the music can step back for it.
//!
//! macOS lists every process that has audio output running. The webview plays
//! from a WebKit helper process, not the app's own, so a process counts as ours
//! when macOS holds the same app responsible for it.

use std::time::{Duration, Instant};

/// Sound shorter than this, a notification or a click, leaves the music alone.
const START_HOLD: Duration = Duration::from_millis(800);
/// Pauses between videos or tracks of another app keep the music down.
const STOP_HOLD: Duration = Duration::from_secs(2);

/// Turns the raw "someone else is playing" samples into steady changes.
#[derive(Default)]
struct Debounce {
    active: bool,
    changing_since: Option<Instant>,
}

impl Debounce {
    /// The new state once `heard` has held long enough; `None` while nothing changes.
    fn update(&mut self, heard: bool, now: Instant) -> Option<bool> {
        if heard == self.active {
            self.changing_since = None;
            return None;
        }
        let since = *self.changing_since.get_or_insert(now);
        let hold = if heard { START_HOLD } else { STOP_HOLD };
        if now.duration_since(since) < hold {
            return None;
        }
        self.active = heard;
        self.changing_since = None;
        Some(heard)
    }
}

#[cfg(target_os = "macos")]
mod watcher {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, Instant};

    use tauri::{AppHandle, Emitter};

    use super::Debounce;

    const POLL: Duration = Duration::from_millis(250);
    const EVENT: &str = "other-audio";

    /// Bumped on every start and stop, so a superseded polling thread ends.
    static GENERATION: AtomicU64 = AtomicU64::new(0);

    pub fn set(app: AppHandle, enabled: bool) {
        let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        if !enabled {
            return;
        }
        let Some(responsible) = coreaudio::responsible_fn() else {
            eprintln!("other audio: no way to tell our own sound apart, not watching");
            return;
        };
        std::thread::spawn(move || {
            let own = responsible(std::process::id() as i32);
            let mut debounce = Debounce::default();
            while GENERATION.load(Ordering::SeqCst) == generation {
                let heard = coreaudio::output_pids()
                    .into_iter()
                    .any(|pid| responsible(pid) != own);
                if let Some(active) = debounce.update(heard, Instant::now()) {
                    let _ = app.emit(EVENT, active);
                }
                std::thread::sleep(POLL);
            }
        });
    }

    mod coreaudio {
        use std::ffi::{c_char, c_void};

        const SYSTEM_OBJECT: u32 = 1;
        const SCOPE_GLOBAL: u32 = u32::from_be_bytes(*b"glob");
        const PROCESS_OBJECT_LIST: u32 = u32::from_be_bytes(*b"prs#");
        const PROCESS_PID: u32 = u32::from_be_bytes(*b"ppid");
        const PROCESS_IS_RUNNING_OUTPUT: u32 = u32::from_be_bytes(*b"piro");
        /// `RTLD_DEFAULT` on Apple platforms.
        const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

        #[repr(C)]
        struct PropertyAddress {
            selector: u32,
            scope: u32,
            element: u32,
        }

        #[link(name = "CoreAudio", kind = "framework")]
        extern "C" {
            fn AudioObjectGetPropertyDataSize(
                object: u32,
                address: *const PropertyAddress,
                qualifier_size: u32,
                qualifier: *const c_void,
                size: *mut u32,
            ) -> i32;
            fn AudioObjectGetPropertyData(
                object: u32,
                address: *const PropertyAddress,
                qualifier_size: u32,
                qualifier: *const c_void,
                size: *mut u32,
                data: *mut c_void,
            ) -> i32;
        }

        extern "C" {
            fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
        }

        pub type ResponsibleFn = extern "C" fn(i32) -> i32;

        /// macOS keeps the responsible process private, so it is looked up at run time.
        pub fn responsible_fn() -> Option<ResponsibleFn> {
            // SAFETY: dlsym with RTLD_DEFAULT and a NUL-terminated name only reads.
            let symbol = unsafe {
                dlsym(
                    RTLD_DEFAULT,
                    c"responsibility_get_pid_responsible_for_pid".as_ptr(),
                )
            };
            // SAFETY: the symbol has had this C signature since macOS 10.14.
            (!symbol.is_null())
                .then(|| unsafe { std::mem::transmute::<*mut c_void, ResponsibleFn>(symbol) })
        }

        fn address(selector: u32) -> PropertyAddress {
            PropertyAddress {
                selector,
                scope: SCOPE_GLOBAL,
                element: 0,
            }
        }

        fn read_u32(object: u32, selector: u32) -> Option<u32> {
            let mut value = 0u32;
            let mut size = std::mem::size_of::<u32>() as u32;
            // SAFETY: the property is a 4-byte scalar and `size` says so.
            let status = unsafe {
                AudioObjectGetPropertyData(
                    object,
                    &address(selector),
                    0,
                    std::ptr::null(),
                    &mut size,
                    (&mut value as *mut u32).cast(),
                )
            };
            (status == 0).then_some(value)
        }

        /// Processes with audio output running; empty before macOS 14, which has no such list.
        pub fn output_pids() -> Vec<i32> {
            let list = address(PROCESS_OBJECT_LIST);
            let mut size = 0u32;
            // SAFETY: only the size is written.
            let status = unsafe {
                AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &list, 0, std::ptr::null(), &mut size)
            };
            if status != 0 {
                return Vec::new();
            }
            let mut objects = vec![0u32; size as usize / std::mem::size_of::<u32>()];
            // SAFETY: the buffer holds `size` bytes of object ids.
            let status = unsafe {
                AudioObjectGetPropertyData(
                    SYSTEM_OBJECT,
                    &list,
                    0,
                    std::ptr::null(),
                    &mut size,
                    objects.as_mut_ptr().cast(),
                )
            };
            if status != 0 {
                return Vec::new();
            }
            objects.truncate(size as usize / std::mem::size_of::<u32>());
            objects
                .into_iter()
                .filter(|&object| {
                    read_u32(object, PROCESS_IS_RUNNING_OUTPUT).is_some_and(|running| running != 0)
                })
                .filter_map(|object| read_u32(object, PROCESS_PID).map(|pid| pid as i32))
                .collect()
        }
    }
}

/// Starts or stops the `other-audio` events; elsewhere than macOS there are none.
#[tauri::command]
pub fn watch_other_audio(app: tauri::AppHandle, enabled: bool) {
    #[cfg(target_os = "macos")]
    watcher::set(app, enabled);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, enabled);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_short_sound_changes_nothing() {
        let start = Instant::now();
        let mut debounce = Debounce::default();
        assert_eq!(debounce.update(true, start), None);
        assert_eq!(
            debounce.update(false, start + Duration::from_millis(300)),
            None
        );
        assert_eq!(debounce.update(true, start + START_HOLD), None);
    }

    #[test]
    fn steady_sound_starts_and_a_long_silence_ends_it() {
        let start = Instant::now();
        let mut debounce = Debounce::default();
        debounce.update(true, start);
        assert_eq!(debounce.update(true, start + START_HOLD), Some(true));
        let quiet = start + Duration::from_secs(5);
        assert_eq!(debounce.update(false, quiet), None);
        assert_eq!(debounce.update(false, quiet + Duration::from_secs(1)), None);
        assert_eq!(debounce.update(false, quiet + STOP_HOLD), Some(false));
    }

    #[test]
    fn a_gap_between_videos_keeps_it_on() {
        let start = Instant::now();
        let mut debounce = Debounce::default();
        debounce.update(true, start);
        debounce.update(true, start + START_HOLD);
        let gap = start + Duration::from_secs(3);
        assert_eq!(debounce.update(false, gap), None);
        assert_eq!(debounce.update(true, gap + Duration::from_secs(1)), None);
        assert_eq!(debounce.update(false, gap + Duration::from_secs(2)), None);
    }
}
