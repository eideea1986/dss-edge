#include <sqlite3.h>
#include <vector>
#include <string>
#include <fstream>
#include <cstdlib>
#include <iostream>
#include <filesystem>

struct Segment {
    std::string file;
};

sqlite3* db;

/* ================= OPEN INDEX ================= */
void openIndex(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db)) {
        std::cerr << "Cannot open index: " << path << "\n";
        exit(1);
    }
}

/* ================= QUERY SEGMENTS ================= */
std::vector<Segment> getSegments(int64_t from, int64_t to) {
    std::vector<Segment> out;

    const char* sql =
        "SELECT file FROM segments "
        "WHERE end_ts >= ? AND start_ts <= ? "
        "ORDER BY id";

    sqlite3_stmt* stmt;
    sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr);
    sqlite3_bind_int64(stmt, 1, from);
    sqlite3_bind_int64(stmt, 2, to);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        Segment s;
        s.file = (const char*)sqlite3_column_text(stmt, 0);
        out.push_back(s);
    }

    sqlite3_finalize(stmt);
    return out;
}

/* ================= BUILD CONCAT ================= */
std::string buildConcat(const std::vector<Segment>& segs,
                        const std::string& base) {
    std::string file = "/tmp/playback_concat.txt";
    std::ofstream f(file);

    for (auto& s : segs) {
        std::string path = base + "/segments/" + s.file;
        if (std::filesystem::exists(path)) {
            f << "file '" << path << "'\n";
        } else {
            std::cerr << "[Warning] Missing segment: " << path << "\n";
        }
    }

    f.close();
    return file;
}

/* ================= START PLAYBACK (ENTERPRISE PIPE) ================= */
void startPlayback(const std::string& concat, double speed) {
    std::string speedFilter = (speed == 1.0) ? "" : ("-vf setpts=PTS/" + std::to_string(speed));
    
    // ENTERPRISE ARCHITECTURE:
    // FFmpeg outputs MPEGTS to stdout (pipe:1)
    // go2rtc consumes this pipe and serves WebRTC to browser
    // NO RTSP intermediate layer
    std::string cmd =
        "ffmpeg -loglevel error "
        "-re "
        "-f concat -safe 0 -i " + concat + " " +
        speedFilter + " "
        "-an "
        "-c:v copy "
        "-f mpegts "
        "pipe:1";  // CRITICAL: Output to stdout for go2rtc pipe

    std::cerr << "[Playback] Starting ENTERPRISE pipe mode\n";
    std::cerr << "[Playback] FFmpeg → stdout → go2rtc → WebRTC\n";
    std::cerr << "[Exec] " << cmd << "\n";
    
    // Execute and pipe stdout
    system(cmd.c_str());
}

/* ================= MAIN ================= */
int main(int argc, char* argv[]) {
    if (argc < 5) {
        std::cout << "Usage: playback_server <archive_path> <from_ts> <to_ts> <speed>\n";
        std::cout << "Example: ./playback_server /opt/dss-edge/storage/cam_001 1700000000000 1700000600000 1.0\n";
        return 1;
    }

    std::string archive = argv[1];
    int64_t from = std::stoll(argv[2]);
    int64_t to   = std::stoll(argv[3]);
    double speed = std::stod(argv[4]);

    std::cout << "=== DSS Playback Server (Enterprise Mode) ===\n";
    std::cout << "Archive: " << archive << "\n";
    std::cout << "Range: " << from << " -> " << to << "\n";
    std::cout << "Speed: " << speed << "x\n";

    openIndex(archive + "/index.db");

    auto segs = getSegments(from, to);
    if (segs.empty()) {
        std::cerr << "[Error] No segments found in range\n";
        
        // Debug: show total segments
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM segments", -1, &stmt, nullptr);
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            std::cout << "[Debug] Total segments in DB: " << sqlite3_column_int(stmt, 0) << "\n";
        }
        sqlite3_finalize(stmt);
        
        sqlite3_close(db);
        return 1;
    }

    std::cout << "[Playback] Found " << segs.size() << " segments\n";

    auto concat = buildConcat(segs, archive);
    startPlayback(concat, speed);

    sqlite3_close(db);
    return 0;
}
