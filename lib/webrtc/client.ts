// WebRTC client for voice channels (MVP: P2P mesh only)
// No SFU, no Stage channels, no recording, no speaker roles

export interface WebRTCConfig {
  signalingUrl: string;
}

export interface VoiceChannelJoinParams {
  channelId: string;
  userId: string;
  userName: string;
}

export class WebRTCClient {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private channelId: string | null = null;
  private currentUserId: string | null = null;
  private participantCheckInterval: number | null = null;

  constructor(_config: WebRTCConfig) {
    // Config is reserved for future use (SFU, custom signaling URLs, etc.)
  }

  async joinVoiceChannel(params: VoiceChannelJoinParams): Promise<void> {
    // If already in this channel, do nothing
    if (this.channelId === params.channelId && this.localStream) {
      console.warn('Already connected to this channel, ignoring duplicate join');
      return;
    }

    // If in a different channel, leave it first
    if (this.channelId && this.channelId !== params.channelId) {
      await this.leaveChannel();
    }

    // Prevent multiple simultaneous join attempts
    if (this.localStream) {
      console.warn('Already have a stream, cleaning up before joining new channel');
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.channelId = params.channelId;
    this.currentUserId = params.userId;

    // Get user media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // Get list of participants from signaling server
    const participants = await this.getParticipants(params.channelId);

    // Create peer connections for each participant (P2P mesh)
    await this.createPeerConnectionsForParticipants(participants, params.channelId, params.userId);

    // Start polling for new participants
    this.startParticipantPolling(params.channelId, params.userId);

    // Start polling for incoming offers and answers
    this.startSignalingPolling(params.channelId);
  }

  private async createPeerConnectionsForParticipants(
    participants: Array<{ userId: string }>,
    channelId: string,
    userId: string
  ): Promise<void> {
    if (!this.localStream) {
      console.error('Cannot create peer connections: no local stream');
      return;
    }

    for (const participant of participants) {
      if (participant.userId === userId) {
        continue; // Skip self
      }

      // Skip if peer connection already exists
      if (this.peerConnections.has(participant.userId)) {
        continue;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      // Add local stream tracks
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });

      // Handle remote streams
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          this.remoteStreams.set(participant.userId, remoteStream);
          console.log(`[WebRTC] Received remote stream from ${participant.userId}`);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendIceCandidate(event.candidate, channelId, participant.userId);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state with ${participant.userId}: ${pc.connectionState}`);
      };

      this.peerConnections.set(participant.userId, pc);

      // Create offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.sendOffer(offer, channelId, participant.userId);
        console.log(`[WebRTC] Created and sent offer to ${participant.userId}`);
      } catch (error) {
        console.error(`[WebRTC] Error creating offer for ${participant.userId}:`, error);
      }
    }
  }

  private startParticipantPolling(channelId: string, userId: string): void {
    // Clear existing interval
    if (this.participantCheckInterval) {
      clearInterval(this.participantCheckInterval);
    }

    // Poll every 3 seconds for new participants
    this.participantCheckInterval = window.setInterval(async () => {
      if (!this.channelId || !this.localStream) {
        return;
      }

      try {
        const participants = await this.getParticipants(channelId);
        const currentParticipantIds = new Set(this.peerConnections.keys());
        const newParticipants = participants.filter(
          (p) => p.userId !== userId && !currentParticipantIds.has(p.userId)
        );

        if (newParticipants.length > 0) {
          console.log(`[WebRTC] Found ${newParticipants.length} new participants, creating peer connections`);
          await this.createPeerConnectionsForParticipants(newParticipants, channelId, userId);
        }
      } catch (error) {
        console.error('[WebRTC] Error checking for new participants:', error);
      }
    }, 3000);
  }

  private startSignalingPolling(channelId: string): void {
    // Poll for incoming offers and answers
    const signalingInterval = window.setInterval(async () => {
      if (!this.channelId || !this.localStream || !this.currentUserId) {
        clearInterval(signalingInterval);
        return;
      }

      const currentUserId = this.currentUserId; // Use instance variable instead of parameter

      try {
        // Check for incoming offers (from users who joined after us)
        const participants = await this.getParticipants(channelId);
        for (const participant of participants) {
          if (participant.userId === currentUserId) continue;
          if (this.peerConnections.has(participant.userId)) continue;

          // Check if there's an offer from this participant
          const offerKey = `webrtc:offer:${channelId}:${participant.userId}:${currentUserId}`;
          const response = await fetch(`/api/voice/signaling/check?key=${encodeURIComponent(offerKey)}`, {
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.offer) {
              console.log(`[WebRTC] Received offer from ${participant.userId}, creating peer connection`);
              await this.handleIncomingOffer(data.offer, channelId, participant.userId);
            }
          }
        }

        // Check for incoming answers
        for (const [targetUserId, pc] of this.peerConnections.entries()) {
          if (pc.remoteDescription) continue; // Already have answer

          const answerKey = `webrtc:answer:${channelId}:${targetUserId}:${currentUserId}`;
          const response = await fetch(`/api/voice/signaling/check?key=${encodeURIComponent(answerKey)}`, {
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.answer) {
              console.log(`[WebRTC] Received answer from ${targetUserId}`);
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
          }
        }
      } catch (error) {
        console.error('[WebRTC] Error polling for signaling:', error);
      }
    }, 2000);
  }

  private async handleIncomingOffer(
    offer: RTCSessionDescriptionInit,
    channelId: string,
    fromUserId: string
  ): Promise<void> {
    if (!this.localStream) {
      console.error('Cannot handle incoming offer: no local stream');
      return;
    }

    // Create peer connection if it doesn't exist
    if (!this.peerConnections.has(fromUserId)) {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      // Add local stream tracks
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });

      // Handle remote streams
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          this.remoteStreams.set(fromUserId, remoteStream);
          console.log(`[WebRTC] Received remote stream from ${fromUserId}`);
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendIceCandidate(event.candidate, channelId, fromUserId);
        }
      };

      this.peerConnections.set(fromUserId, pc);
    }

    const pc = this.peerConnections.get(fromUserId);
    if (!pc) {
      console.error(`[WebRTC] Peer connection not found for ${fromUserId}`);
      return;
    }

    // Set remote description (the offer)
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer
    await this.sendAnswer(answer, channelId, fromUserId);
  }

  private async sendAnswer(
    answer: RTCSessionDescriptionInit,
    channelId: string,
    targetUserId: string
  ): Promise<void> {
    try {
      const response = await fetch('/api/voice/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          type: 'answer',
          answer,
          channelId,
          targetUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send answer: ${response.statusText}`);
      }

      console.log(`[WebRTC] Sent answer to ${targetUserId}`);
    } catch (error) {
      console.error('Error sending answer:', error);
      throw error;
    }
  }

  private async getParticipants(channelId: string): Promise<Array<{ userId: string }>> {
    // Get participants from API
    const response = await fetch(`/api/voice/participants?channelId=${channelId}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      console.error('Failed to get participants:', response.statusText);
      return [];
    }
    const data = await response.json();
    return data.participants || [];
  }

  async leaveChannel(): Promise<void> {
    // Stop polling
    if (this.participantCheckInterval) {
      clearInterval(this.participantCheckInterval);
      this.participantCheckInterval = null;
    }

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
    }

    // Close all peer connections
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    // Clear remote streams
    this.remoteStreams.clear();

      // Notify signaling server
      if (this.channelId) {
        try {
          await fetch('/api/voice/leave', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              channelId: this.channelId,
            }),
          });
        } catch (error) {
          console.error('Failed to notify leave:', error);
        }
      }

    this.channelId = null;
    this.currentUserId = null;
  }

  mute(): void {
    if (this.localStream) {
      const tracks = this.localStream.getAudioTracks();
      console.log(`[WebRTC] Muting ${tracks.length} audio track(s)`);
      tracks.forEach((track) => {
        track.enabled = false;
        console.log(`[WebRTC] Track ${track.id} muted, enabled: ${track.enabled}`);
      });
    } else {
      console.warn('[WebRTC] Cannot mute: no local stream');
    }
  }

  unmute(): void {
    if (this.localStream) {
      const tracks = this.localStream.getAudioTracks();
      console.log(`[WebRTC] Unmuting ${tracks.length} audio track(s)`);
      tracks.forEach((track) => {
        track.enabled = true;
        console.log(`[WebRTC] Track ${track.id} unmuted, enabled: ${track.enabled}`);
      });
    } else {
      console.warn('[WebRTC] Cannot unmute: no local stream');
    }
  }

  deafen(): void {
    this.mute();
    // Also mute remote audio
    this.remoteStreams.forEach((stream) => {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    });
  }

  undeafen(): void {
    this.unmute();
    // Unmute remote audio
    this.remoteStreams.forEach((stream) => {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    });
  }

  // Screen sharing removed for MVP

  private async sendOffer(
    offer: RTCSessionDescriptionInit,
    channelId: string,
    targetUserId: string
  ): Promise<void> {
    // Send to signaling server via API
    try {
      const response = await fetch('/api/voice/signaling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          type: 'offer',
          offer,
          channelId,
          targetUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send offer: ${response.statusText}`);
      }

      // Note: Answer will be received via polling in startSignalingPolling
      console.log(`[WebRTC] Sent offer to ${targetUserId}`);
    } catch (error) {
      console.error('Error sending offer:', error);
      throw error;
    }
  }

  private async sendIceCandidate(
    candidate: RTCIceCandidate,
    channelId: string,
    targetUserId: string
  ): Promise<void> {
    // Send ICE candidate to signaling server
    try {
      await fetch('/api/voice/ice-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          candidate,
          channelId,
          targetUserId,
        }),
      });
    } catch (error) {
      console.error('Error sending ICE candidate:', error);
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStreams(): MediaStream[] {
    return Array.from(this.remoteStreams.values());
  }
}
