"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient;

interface Test {
  id: string;
  name: string;
  groupName: string;
  unit: string;
  method: string;
  refMin: number | null;
  refMax: number | null;
}

interface TestValue {
  testId: string;
  resultId?: string;
  valueNum: string;
  valueText: string;
  notes: string;
}

export default function AddResultsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Session details
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  });
  const [selectedTime, setSelectedTime] = useState(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`; // HH:mm
  });
  const [costAed, setCostAed] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  
  // Test values - Map<testId, value>
  const [testValues, setTestValues] = useState<Map<string, TestValue>>(new Map());
  
  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  
  // Dark mode
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  const V = {
    bg: isDark ? "#0a0e1a" : "#ffffff",
    surface: isDark ? "#141824" : "#ffffff",
    border: isDark ? "#1e2433" : "#e5e7eb",
    text: isDark ? "#e5e7eb" : "#111827",
    muted: isDark ? "#9ca3af" : "#6b7280",
    faint: isDark ? "#6b7280" : "#9ca3af",
    accent: "#14b8a6",
  };

  // Load user and tests
  useEffect(() => {
    const load = async () => {
      const cl = supabase();
      const { data: { user } } = await cl.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      // Load all tests
      const { data: testsData } = await cl
        .from("biomarker_tests")
        .select("*")
        .eq("user_id", user.id)
        .order("group_name")
        .order("name");

      if (testsData) {
        setTests(testsData.map((t: any) => ({
          id: t.id,
          name: t.name,
          groupName: t.group_name,
          unit: t.unit,
          method: t.method,
          refMin: t.ref_min,
          refMax: t.ref_max,
        })));
      }

      setLoading(false);
    };
    load();
  }, [router]);

  // Load existing results when date changes
  useEffect(() => {
    if (!userId || !selectedDate) return;
    
    const loadExistingResults = async () => {
      const cl = supabase();
      
      console.log("Loading results for date:", selectedDate);
      
      const { data: resultsData, error: resultsError } = await cl
        .from("biomarker_results")
        .select("*")
        .eq("test_date", selectedDate);

      if (resultsError) {
        console.error("Error loading results:", resultsError);
        return;
      }

      console.log("Loaded results:", resultsData?.length || 0);

      if (resultsData && resultsData.length > 0) {
        const newValues = new Map<string, TestValue>();
        resultsData.forEach((r: any) => {
          newValues.set(r.test_id, {
            testId: r.test_id,
            resultId: r.id,
            valueNum: r.value_num?.toString() || "",
            valueText: r.value_text || "",
            notes: r.notes || "",
          });
        });
        setTestValues(newValues);
        console.log("Set values for tests:", newValues.size);

        // Load session details
        const { data: sessionData, error: sessionError } = await cl
          .from("biomarker_sessions")
          .select("*")
          .eq("session_date", selectedDate)
          .single();

        if (sessionError) {
          console.log("No session data found (this is OK for new dates)");
        } else if (sessionData) {
          console.log("Loaded session data:", sessionData);
          setCostAed(sessionData.total_paid_aed?.toString() || "");
          setClinicName(sessionData.clinic_name || "");
          setSessionNotes(sessionData.notes || "");
        }
      } else {
        // Clear values for new date
        console.log("No existing results - starting fresh");
        setTestValues(new Map());
        setCostAed("");
        setClinicName("");
        setSessionNotes("");
      }
    };

    loadExistingResults();
  }, [selectedDate, userId]);

  // Group tests
  const groupedTests = useMemo(() => {
    const groups = new Map<string, Test[]>();
    tests.forEach(t => {
      if (!groups.has(t.groupName)) groups.set(t.groupName, []);
      groups.get(t.groupName)!.push(t);
    });
    
    // Sort groups alphabetically, "Other" last
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0].toLowerCase() === "other") return 1;
      if (b[0].toLowerCase() === "other") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [tests]);

  // Stats
  const stats = useMemo(() => {
    const filled = Array.from(testValues.values()).filter(
      v => v.valueNum || v.valueText
    ).length;
    return { filled, total: tests.length };
  }, [testValues, tests.length]);

  const updateTestValue = (testId: string, field: keyof TestValue, value: string) => {
    setTestValues(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(testId) || { testId, valueNum: "", valueText: "", notes: "" };
      newMap.set(testId, { ...existing, [field]: value });
      return newMap;
    });
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  const saveAll = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      const cl = supabase();

      // 1. Try to save session details (optional - table might not exist)
      try {
        await cl
          .from("biomarker_sessions")
          .upsert({
            user_id: userId,
            session_date: selectedDate,
            total_paid_aed: costAed ? parseFloat(costAed) : null,
            clinic_name: clinicName || null,
            notes: sessionNotes || null,
          }, {
            onConflict: 'user_id,session_date'
          });
        console.log("✓ Session details saved");
      } catch (sessionError: any) {
        // Table might not exist - that's OK, just log it
        console.warn("⚠ Could not save session details (table might not exist):", sessionError.message);
        // Continue anyway - session details are optional
      }

      // 2. Prepare all results for upsert
      const resultsToSave: any[] = [];
      
      testValues.forEach((value, testId) => {
        // Skip if both numeric and text values are empty
        if (!value.valueNum && !value.valueText) return;

        resultsToSave.push({
          user_id: userId,
          test_id: testId,
          test_date: selectedDate,
          // Removed test_datetime - column doesn't exist
          value_num: value.valueNum ? parseFloat(value.valueNum) : null,
          value_text: value.valueText || null,
          notes: value.notes || null,
        });
      });

      if (resultsToSave.length === 0) {
        alert("No test values to save!");
        setSaving(false);
        return;
      }

      // 3. Upsert all results (update existing or insert new)
      // We need to handle this differently because biomarker_results doesn't have a simple unique key
      // So we'll delete existing results for this date and insert new ones
      
      // First, get all test IDs we're saving
      const testIds = resultsToSave.map(r => r.test_id);
      
      // Delete existing results for these tests on this date
      const { error: deleteError } = await cl
        .from("biomarker_results")
        .delete()
        .eq("test_date", selectedDate)
        .in("test_id", testIds);

      if (deleteError) {
        console.error("Delete error:", deleteError);
        alert(`Error clearing old results: ${deleteError.message}`);
        setSaving(false);
        return;
      }

      // Insert all new results
      const { error: insertError } = await cl
        .from("biomarker_results")
        .insert(resultsToSave);

      if (insertError) {
        console.error("Insert error:", insertError);
        alert(`Error saving results: ${insertError.message}`);
        setSaving(false);
        return;
      }

      // Success!
      alert(`Successfully saved ${resultsToSave.length} test result${resultsToSave.length === 1 ? '' : 's'}!`);
      router.push("/dashboard/biomarkers");
    } catch (error: any) {
      console.error("Unexpected error:", error);
      alert(`Unexpected error: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 13,
    border: `1px solid ${V.border}`,
    borderRadius: 6,
    background: V.surface,
    color: V.text,
  };

  const btnStyle = {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 700,
    border: `1px solid ${V.border}`,
    borderRadius: 8,
    background: V.surface,
    color: V.text,
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const section = {
    background: V.surface,
    border: `1px solid ${V.border}`,
    borderRadius: 12,
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: V.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 18, color: V.muted }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: V.bg, padding: "20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: V.text, margin: 0 }}>
                <span style={{ color: V.accent }}>Bio</span>Markers
              </h1>
              <div style={{ fontSize: 14, color: V.muted, marginTop: 4 }}>Add Test Results</div>
            </div>
            <button onClick={() => router.push("/dashboard/biomarkers")} style={{ ...btnStyle, padding: "8px 16px" }}>
              ← Back
            </button>
          </div>
        </div>

        {/* Session Details */}
        <div style={{ ...section, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Session Details</div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", marginBottom: 6 }}>
                Test Date *
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", marginBottom: 6 }}>
                Test Time *
              </div>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", marginBottom: 6 }}>
                Total Cost (AED)
              </div>
              <input
                type="number"
                step="0.01"
                value={costAed}
                onChange={(e) => setCostAed(e.target.value)}
                placeholder="e.g., 450.00"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", marginBottom: 6 }}>
                Clinic/Lab Name
              </div>
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="e.g., HealthPlus Clinic"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: V.faint, textTransform: "uppercase", marginBottom: 6 }}>
              Remarks / Notes
            </div>
            <textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="Any notes about this session..."
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>
        </div>

        {/* Stats */}
        <div style={{ ...section, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Progress: <span style={{ color: V.accent }}>{stats.filled}</span> / {stats.total} tests filled
            </div>
            <div style={{ fontSize: 12, color: V.muted }}>
              {stats.filled === 0 ? "Start entering values below" : `${Math.round((stats.filled / stats.total) * 100)}% complete`}
            </div>
          </div>
        </div>

        {/* Grouped Tests */}
        <div style={{ display: "grid", gap: 16, marginBottom: 20 }}>
          {groupedTests.map(([groupName, groupTests]) => {
            const isCollapsed = collapsedGroups.has(groupName);
            const groupFilled = groupTests.filter(t => {
              const val = testValues.get(t.id);
              return val && (val.valueNum || val.valueText);
            }).length;

            return (
              <div key={groupName} style={section}>
                {/* Group Header */}
                <div
                  onClick={() => toggleGroup(groupName)}
                  style={{
                    padding: 16,
                    cursor: "pointer",
                    borderBottom: isCollapsed ? "none" : `1px solid ${V.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{groupName}</span>
                    <span style={{ fontSize: 12, color: V.muted, marginLeft: 8 }}>
                      ({groupFilled}/{groupTests.length} filled)
                    </span>
                  </div>
                  <div style={{ fontSize: 20, color: V.muted }}>{isCollapsed ? "+" : "−"}</div>
                </div>

                {/* Group Content */}
                {!isCollapsed && (
                  <div style={{ padding: 16, display: "grid", gap: 12 }}>
                    {groupTests.map(test => {
                      const value = testValues.get(test.id) || { testId: test.id, valueNum: "", valueText: "", notes: "" };
                      const isFilled = !!(value.valueNum || value.valueText);

                      return (
                        <div
                          key={test.id}
                          style={{
                            border: `1px solid ${isFilled ? V.accent : V.border}`,
                            borderRadius: 8,
                            padding: 12,
                            background: isFilled ? (isDark ? "#0a2f2d" : "#f0fdfa") : V.surface,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                                {isFilled && <span style={{ color: V.accent }}>✓</span>}
                                {test.name}
                              </div>
                              <div style={{ fontSize: 11, color: V.muted, marginTop: 2 }}>
                                {test.unit && <span>Unit: {test.unit}</span>}
                                {test.method && <span> · Method: {test.method}</span>}
                                {(test.refMin || test.refMax) && (
                                  <span> · Range: {test.refMin ?? "—"} - {test.refMax ?? "—"}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, marginBottom: 4 }}>
                                NUMERIC VALUE
                              </div>
                              <input
                                type="number"
                                step="0.001"
                                value={value.valueNum}
                                onChange={(e) => updateTestValue(test.id, "valueNum", e.target.value)}
                                placeholder="e.g., 12.5"
                                style={inputStyle}
                              />
                            </div>

                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, marginBottom: 4 }}>
                                TEXT VALUE
                              </div>
                              <input
                                type="text"
                                value={value.valueText}
                                onChange={(e) => updateTestValue(test.id, "valueText", e.target.value)}
                                placeholder="e.g., Positive"
                                style={inputStyle}
                              />
                            </div>

                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: V.faint, marginBottom: 4 }}>
                                NOTES
                              </div>
                              <input
                                type="text"
                                value={value.notes}
                                onChange={(e) => updateTestValue(test.id, "notes", e.target.value)}
                                placeholder="Any notes..."
                                style={inputStyle}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save Button */}
        <div style={{ ...section, padding: 20 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={saveAll}
              disabled={saving || stats.filled === 0}
              style={{
                ...btnStyle,
                flex: 1,
                background: V.accent,
                color: "#fff",
                border: "none",
                opacity: saving || stats.filled === 0 ? 0.5 : 1,
                cursor: saving || stats.filled === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : `Save ${stats.filled} Result${stats.filled === 1 ? "" : "s"}`}
            </button>
            <button onClick={() => router.push("/dashboard/biomarkers")} style={btnStyle}>
              Cancel
            </button>
          </div>
          {stats.filled === 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: V.muted, textAlign: "center" }}>
              Enter at least one test result to save
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
