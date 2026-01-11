extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/mathematics.h>
}
#include <string>
#include <iostream>
#include <vector>
#include "RingBuffer.hpp"

#include <filesystem>

extern RingBuffer<FrameData> frameBuffer;
void insertFrame(int64_t ts, bool key);
void insertSegment(const std::string& filename, int64_t start_ts);
void closeSegment(int64_t end_ts);
std::string nextSegmentPath(const std::string& base);

void startDecoder(const std::string& rtsp, const std::string& basePath) {
    av_log_set_level(AV_LOG_ERROR);
    avformat_network_init();

    AVFormatContext* ifmt_ctx = nullptr;
    AVDictionary* opts = nullptr;
    av_dict_set(&opts, "rtsp_transport", "tcp", 0);
    av_dict_set(&opts, "stimeout", "5000000", 0);
    
    int ret = avformat_open_input(&ifmt_ctx, rtsp.c_str(), nullptr, &opts);
    if (ret < 0) {
        return; 
    }

    if (avformat_find_stream_info(ifmt_ctx, nullptr) < 0) {
        return;
    }

    int video_stream_idx = -1;
    for (unsigned int i = 0; i < ifmt_ctx->nb_streams; i++) {
        if (ifmt_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            video_stream_idx = i;
            break;
        }
    }

    if (video_stream_idx == -1) {
        std::cerr << "[Decoder] No video stream found" << std::endl;
        return;
    }

    AVFormatContext* ofmt_ctx = nullptr;
    AVPacket pkt;
    int64_t last_keyframe_pts = -1;
    AVStream* in_stream = ifmt_ctx->streams[video_stream_idx];
    
    // === SEGMENT ROTATION TRACKING ===
    // Instead of using PTS diff (unreliable), use wall-clock time
    auto segment_start_wallclock = std::chrono::steady_clock::now();
    constexpr int SEGMENT_DURATION_SECONDS = 2;
    
    std::cerr << "[Decoder] Segment rotation: Every " << SEGMENT_DURATION_SECONDS << " seconds on keyframe" << std::endl;

    auto start_new_segment = [&](AVPacket* p) {
        if (ofmt_ctx) {
            closeSegment(p->pts); // Mark end of previous segment
            av_write_trailer(ofmt_ctx);
            avio_closep(&ofmt_ctx->pb);
            avformat_free_context(ofmt_ctx);
            ofmt_ctx = nullptr;
        }

        std::string path = nextSegmentPath(basePath);
        std::string filename = std::filesystem::path(path).filename().string();
        
        std::cerr << "[Segmenter] New Segment: " << filename << " StartPTS: " << p->pts << std::endl;
        insertSegment(filename, p->pts);

        avformat_alloc_output_context2(&ofmt_ctx, nullptr, "mpegts", path.c_str());
        AVStream* out_stream = avformat_new_stream(ofmt_ctx, nullptr);
        avcodec_parameters_copy(out_stream->codecpar, in_stream->codecpar);
        out_stream->codecpar->codec_tag = 0;

        if (!(ofmt_ctx->oformat->flags & AVFMT_NOFILE)) {
            if (avio_open(&ofmt_ctx->pb, path.c_str(), AVIO_FLAG_WRITE) < 0) {
                std::cerr << "[Segmenter] Could not open: " << path << std::endl;
                return;
            }
        }

        avformat_write_header(ofmt_ctx, nullptr);
        last_keyframe_pts = p->pts;
        
        // Reset wall-clock timer for next segment
        segment_start_wallclock = std::chrono::steady_clock::now();
    };

    int pkt_count = 0;
    // === HEARTBEAT FOR SUPERVISOR ===
    std::string heartbeatFile = "/tmp/dss-recorder.hb";
    int frameCounter = 0;
    
    while (av_read_frame(ifmt_ctx, &pkt) >= 0) {
        if (pkt.stream_index == video_stream_idx) {
            frameCounter++;
            
            // Update heartbeat every 100 frames (~4 seconds at 25fps)
            if (frameCounter % 100 == 0) {
                FILE* hb = fopen(heartbeatFile.c_str(), "w");
                if (hb) {
                    fprintf(hb, "%d", frameCounter);
                    fclose(hb);
                }
            }
            bool is_key = pkt.flags & AV_PKT_FLAG_KEY;
            pkt_count++;
            
            // Debug every keyframe
            if (is_key) {
               std::cerr << "K(" << pkt.pts << ") ";
            }

            // === SEGMENT ROTATION (ENTERPRISE) ===
            // Check wall-clock time elapsed since segment start
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - segment_start_wallclock).count();
            
            // Rotate segment if:
            // 1. Keyframe detected (clean cut point)
            // 2. No segment open OR time elapsed >= SEGMENT_DURATION_SECONDS
            if (is_key && (!ofmt_ctx || elapsed >= SEGMENT_DURATION_SECONDS)) {
                std::cerr << "\n[Decoder] Segment rotation triggered. Elapsed: " << elapsed << "s" << std::endl;
                start_new_segment(&pkt);
            }

            if (ofmt_ctx) {
                AVStream* out_stream = ofmt_ctx->streams[0];
                
                pkt.pts = av_rescale_q_rnd(pkt.pts, in_stream->time_base, out_stream->time_base, (AVRounding)(AV_ROUND_NEAR_INF|AV_ROUND_PASS_MINMAX));
                pkt.dts = av_rescale_q_rnd(pkt.dts, in_stream->time_base, out_stream->time_base, (AVRounding)(AV_ROUND_NEAR_INF|AV_ROUND_PASS_MINMAX));
                pkt.duration = av_rescale_q(pkt.duration, in_stream->time_base, out_stream->time_base);
                pkt.pos = -1;
                pkt.stream_index = 0;

                av_interleaved_write_frame(ofmt_ctx, &pkt);
                insertFrame(pkt.pts, is_key);
            }
        }
        av_packet_unref(&pkt);
    }

    if (ofmt_ctx) {
        av_write_trailer(ofmt_ctx);
        avio_closep(&ofmt_ctx->pb);
        avformat_free_context(ofmt_ctx);
    }
    avformat_close_input(&ifmt_ctx);
}
