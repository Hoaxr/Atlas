import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { trackStreamUrl, albumCoverUrl } from '../lib/posterUrl';
import api from '../lib/api';
import toast from 'react-hot-toast';

const AudioPlayerContext = createContext(null);

export function AudioPlayerProvider({ children }) {
  const audioRef = useRef(null);

  // State
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('atlas_music_volume');
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState('none'); // 'none' | 'all' | 'one'
  const [isShuffle, setIsShuffle] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);

  // Initialize Audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime || 0);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Next / Previous helpers
  const playTrackAtIndex = useCallback((index, trackList = queue) => {
    if (!trackList || trackList.length === 0 || index < 0 || index >= trackList.length) return;

    const track = trackList[index];
    const streamUrl = trackStreamUrl(track.id);
    if (!streamUrl) {
      toast.error('Unable to stream track');
      return;
    }

    setQueue(trackList);
    setQueueIndex(index);
    setCurrentTrack(track);
    setProgress(0);
    setDuration(track.duration || 0);

    const audio = audioRef.current;
    if (audio) {
      audio.src = streamUrl;
      audio.load();
      audio.play().catch((err) => {
        console.warn('[AudioPlayer] Autoplay prevented or stream error:', err);
      });
    }

    // MediaSession lockscreen / notification controls
    if ('mediaSession' in navigator) {
      try {
        const cover = track.album_mbid ? albumCoverUrl(track.album_mbid) : null;
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: track.title || 'Unknown Title',
          artist: track.artist_name || 'Unknown Artist',
          album: track.album_title || 'Unknown Album',
          artwork: cover ? [{ src: cover, sizes: '512x512', type: 'image/jpeg' }] : []
        });
      } catch { /* ignore */ }
    }
  }, [queue]);

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return;

    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    if (isShuffle && queue.length > 1) {
      let rand = Math.floor(Math.random() * queue.length);
      while (rand === queueIndex && queue.length > 1) {
        rand = Math.floor(Math.random() * queue.length);
      }
      playTrackAtIndex(rand, queue);
      return;
    }

    const nextIdx = queueIndex + 1;
    if (nextIdx < queue.length) {
      playTrackAtIndex(nextIdx, queue);
    } else if (repeatMode === 'all') {
      playTrackAtIndex(0, queue);
    } else {
      setIsPlaying(false);
    }
  }, [queue, queueIndex, repeatMode, isShuffle, playTrackAtIndex]);

  const prevTrack = useCallback(() => {
    if (queue.length === 0) return;

    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    const prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      playTrackAtIndex(prevIdx, queue);
    } else if (repeatMode === 'all') {
      playTrackAtIndex(queue.length - 1, queue);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [queue, queueIndex, repeatMode, playTrackAtIndex]);

  // Handle track end event
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      nextTrack();
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [nextTrack]);

  // Setup MediaSession action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prevTrack();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextTrack();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
      }
    });

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch { /* ignore */ }
    };
  }, [prevTrack, nextTrack]);

  // Public Methods
  const playTrack = useCallback((track, trackList = null) => {
    if (!track) return;
    const list = trackList && trackList.length > 0 ? trackList : [track];
    const idx = list.findIndex((t) => t.id === track.id);
    playTrackAtIndex(idx >= 0 ? idx : 0, list);
  }, [playTrackAtIndex]);

  const playAlbum = useCallback(async (album, explicitTracks = null) => {
    try {
      let tracks = explicitTracks;
      if (!tracks || tracks.length === 0) {
        const res = await api.get(`/library/music/albums/${album.id}/tracks`);
        if (res.data.status === 'success') {
          tracks = res.data.data;
        }
      }

      const playable = (tracks || []).filter((t) => t.status === 'downloaded' || t.file_path);
      if (playable.length === 0) {
        toast.error('No downloaded tracks found for this album');
        return;
      }

      const enriched = playable.map((t) => ({
        ...t,
        artist_name: t.artist_name || album.artist_name,
        album_title: t.album_title || album.title,
        album_mbid: t.album_mbid || album.mbid,
      }));

      playTrackAtIndex(0, enriched);
      toast.success(`Playing ${album.title}`);
    } catch (err) {
      console.error('[AudioPlayer] Failed to play album:', err);
      toast.error('Failed to load album tracks');
    }
  }, [playTrackAtIndex]);

  const playArtist = useCallback(async (artist) => {
    try {
      const res = await api.get(`/library/music/artists/${artist.id}/tracks`);
      if (res.data.status === 'success' && res.data.data?.length > 0) {
        const enriched = res.data.data.map((t) => ({
          ...t,
          artist_name: t.artist_name || artist.name
        }));
        playTrackAtIndex(0, enriched);
        toast.success(`Playing ${artist.name}`);
      } else {
        toast.error('No downloaded tracks found for this artist');
      }
    } catch (err) {
      console.error('[AudioPlayer] Failed to play artist:', err);
      toast.error('Failed to load artist tracks');
    }
  }, [playTrackAtIndex]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const seekTo = useCallback((seconds) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setProgress(seconds);
    }
  }, []);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    setIsMuted(false);
    localStorage.setItem('atlas_music_volume', String(clamped));
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);

  const clearQueue = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }, []);

  const removeFromQueue = useCallback((idx) => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (idx === queueIndex) {
        if (next.length === 0) {
          clearQueue();
        } else {
          const nextIdx = Math.min(idx, next.length - 1);
          playTrackAtIndex(nextIdx, next);
        }
      } else if (idx < queueIndex) {
        setQueueIndex((prevIdx) => prevIdx - 1);
      }
      return next;
    });
  }, [queueIndex, clearQueue, playTrackAtIndex]);

  const value = {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    progress,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    queueVisible,
    setQueueVisible,
    playTrack,
    playAlbum,
    playArtist,
    playTrackAtIndex,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    clearQueue,
    removeFromQueue
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
