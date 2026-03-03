import { AppConfig } from "./config";

export interface SecurityTip {
  id: string;
  category: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  /** Why this matters */
  impact: string;
  /** Step-by-step remediation */
  steps: string[];
  /** Commands the user can try in the playground */
  commands?: { label: string; command: string; description: string }[];
  /** External references */
  references?: { title: string; url: string }[];
  tags: string[];
}

// ─── Add new tips here. The UI picks them up automatically. ───────────────────

export const SECURITY_TIPS: SecurityTip[] = [
  {
    id: "ssh-hardening",
    category: "SSH Hardening",
    title: "Disable root login and password authentication",
    severity: "critical",
    description:
      "Root login over SSH is the #1 target for brute-force attacks. Disabling it forces attackers to guess both a username and a key, dramatically reducing the attack surface.",
    impact:
      "An exposed root SSH login allows attackers to gain full system control with a single credential. Combined with password auth, it makes brute-force attacks trivial.",
    steps: [
      "Edit /etc/ssh/sshd_config",
      "Set PermitRootLogin no",
      "Set PasswordAuthentication no",
      "Set PubkeyAuthentication yes",
      "Restart sshd: sudo systemctl restart sshd",
      "Verify: ssh root@your-server should be rejected",
    ],
    commands: [
      {
        label: "Check current config",
        command: "sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'",
        description: "Shows the effective SSH daemon configuration for key auth settings.",
      },
      {
        label: "Test SSH config",
        command: "sudo sshd -t",
        description: "Validates sshd_config syntax before restarting. Returns nothing if valid.",
      },
      {
        label: "Restart SSH",
        command: "sudo systemctl restart sshd",
        description: "Applies the new configuration. Make sure you have key-based access first!",
      },
    ],
    references: [
      { title: "OpenSSH Manual — sshd_config", url: "https://man.openbsd.org/sshd_config" },
    ],
    tags: ["ssh", "brute-force", "authentication", "root"],
  },
  {
    id: "fail2ban-setup",
    category: "Intrusion Prevention",
    title: "Install and configure fail2ban for SSH",
    severity: "critical",
    description:
      "fail2ban monitors log files and bans IPs that show malicious signs — too many password failures, seeking exploits, etc. It's the first line of automated defense.",
    impact:
      "Without fail2ban, a single attacker can attempt thousands of passwords per minute. fail2ban automatically blocks them after a configurable number of failures.",
    steps: [
      "Install: sudo apt install fail2ban (Debian/Ubuntu) or sudo yum install fail2ban (RHEL)",
      "Copy default config: sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local",
      "Edit jail.local: set bantime = 1h, findtime = 10m, maxretry = 3",
      "Enable SSH jail: set enabled = true under [sshd]",
      "Start: sudo systemctl enable --now fail2ban",
      "Verify: sudo fail2ban-client status sshd",
    ],
    commands: [
      {
        label: "Check fail2ban status",
        command: "sudo fail2ban-client status sshd",
        description: "Shows currently banned IPs and filter stats for the SSH jail.",
      },
      {
        label: "Ban an IP manually",
        command: "sudo fail2ban-client set sshd banip 203.0.113.42",
        description: "Immediately bans the specified IP in the sshd jail.",
      },
      {
        label: "Unban an IP",
        command: "sudo fail2ban-client set sshd unbanip 203.0.113.42",
        description: "Removes the ban for the specified IP.",
      },
      {
        label: "View fail2ban log",
        command: "sudo tail -50 /var/log/fail2ban.log",
        description: "Shows recent fail2ban activity including bans and unbans.",
      },
    ],
    references: [
      { title: "fail2ban Documentation", url: "https://www.fail2ban.org/wiki/index.php/Main_Page" },
    ],
    tags: ["fail2ban", "brute-force", "ips", "automation"],
  },
  {
    id: "firewall-rules",
    category: "Network Security",
    title: "Configure firewall to restrict attack surface",
    severity: "high",
    description:
      "A properly configured firewall ensures only necessary ports are exposed. Every open port is a potential entry point for attackers.",
    impact:
      "Open ports expose services to the internet. Attackers scan for open ports and exploit vulnerable services. Minimizing exposure reduces the attack surface significantly.",
    steps: [
      "Audit open ports: sudo ss -tlnp",
      "Define allowed ports (e.g., 22, 80, 443)",
      "Set default policy to DROP: sudo iptables -P INPUT DROP",
      "Allow established connections: sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
      "Allow loopback: sudo iptables -A INPUT -i lo -j ACCEPT",
      "Allow specific ports: sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT",
      "Save rules: sudo iptables-save > /etc/iptables/rules.v4",
    ],
    commands: [
      {
        label: "List open ports",
        command: "sudo ss -tlnp",
        description: "Shows all TCP ports currently listening with their associated processes.",
      },
      {
        label: "View current iptables rules",
        command: "sudo iptables -L -n -v --line-numbers",
        description: "Displays all firewall rules with packet counters and line numbers.",
      },
      {
        label: "Block a specific IP",
        command: "sudo iptables -A INPUT -s 203.0.113.42 -j DROP",
        description: "Drops all incoming traffic from the specified IP address.",
      },
      {
        label: "Allow SSH only from trusted network",
        command: "sudo iptables -A INPUT -p tcp -s 10.0.0.0/8 --dport 22 -j ACCEPT",
        description: "Restricts SSH access to your internal network only.",
      },
    ],
    references: [
      { title: "iptables Tutorial", url: "https://www.netfilter.org/documentation/" },
    ],
    tags: ["firewall", "iptables", "ports", "network"],
  },
  {
    id: "ssh-port-change",
    category: "SSH Hardening",
    title: "Change default SSH port",
    severity: "medium",
    description:
      "Moving SSH off port 22 eliminates the vast majority of automated scanning bots. It's security through obscurity but significantly reduces noise.",
    impact:
      "Most automated attacks target port 22 exclusively. Changing the port won't stop a determined attacker but eliminates 99% of bot traffic.",
    steps: [
      "Choose a high port (e.g., 2222 or 22222)",
      "Edit /etc/ssh/sshd_config: set Port 2222",
      "Update firewall to allow the new port",
      "Restart sshd: sudo systemctl restart sshd",
      "Test connection on new port before closing old one",
      "Update fail2ban config to monitor the new port",
    ],
    commands: [
      {
        label: "Check current SSH port",
        command: "sudo sshd -T | grep port",
        description: "Shows which port(s) the SSH daemon is configured to listen on.",
      },
      {
        label: "Allow new port in firewall",
        command: "sudo iptables -A INPUT -p tcp --dport 2222 -j ACCEPT",
        description: "Opens the new SSH port in iptables before switching.",
      },
    ],
    tags: ["ssh", "port", "scanning", "bots"],
  },
  {
    id: "log-monitoring",
    category: "Monitoring",
    title: "Set up centralized log monitoring",
    severity: "high",
    description:
      "Centralized logging ensures you can detect and investigate incidents even if an attacker compromises a single server and clears local logs.",
    impact:
      "Without centralized logging, attackers can cover their tracks by deleting local logs. You lose visibility into what happened and when.",
    steps: [
      "Forward auth logs to your SecOps webhook endpoint",
      "Set up PAM logging for all authentication events",
      "Configure sshd to log at VERBOSE level",
      "Monitor /var/log/auth.log and /var/log/secure",
      "Set up alerts for failed login spikes",
    ],
    commands: [
      {
        label: "View recent auth failures",
        command: "sudo grep 'Failed password' /var/log/auth.log | tail -20",
        description: "Shows the 20 most recent failed password attempts.",
      },
      {
        label: "Count failures by IP",
        command: "sudo grep 'Failed password' /var/log/auth.log | grep -oP '\\d+\\.\\d+\\.\\d+\\.\\d+' | sort | uniq -c | sort -rn | head -10",
        description: "Ranks source IPs by number of failed login attempts.",
      },
      {
        label: "Send test event to SecOps",
        command: `curl -X POST \`${AppConfig.url}/api/webhook\` \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: your-secret" \\
  -d '{"event":"ssh_attempt","status":"failed","auth_method":"password","host":"test-server","user":"root","source_ip":"203.0.113.42","service":"sshd","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S+00:00)'"}'`,
        description: "Sends a test security event to your SecOps Center webhook.",
      },
    ],
    tags: ["logging", "monitoring", "pam", "syslog"],
  },
  {
    id: "key-management",
    category: "Authentication",
    title: "Use Ed25519 SSH keys with passphrases",
    severity: "high",
    description:
      "Ed25519 keys are shorter, faster, and more secure than RSA. Adding a passphrase protects the key if the private key file is compromised.",
    impact:
      "Weak or unprotected SSH keys are equivalent to writing your password on a sticky note. A stolen key without a passphrase gives instant access.",
    steps: [
      "Generate key: ssh-keygen -t ed25519 -C 'your-email'",
      "Set a strong passphrase when prompted",
      "Copy to server: ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server",
      "Verify key-only login works",
      "Disable password auth in sshd_config",
      "Use ssh-agent to avoid retyping passphrase: eval $(ssh-agent) && ssh-add",
    ],
    commands: [
      {
        label: "Generate Ed25519 key",
        command: "ssh-keygen -t ed25519 -C 'secops-admin'",
        description: "Creates a new Ed25519 SSH key pair. You'll be prompted for a passphrase.",
      },
      {
        label: "List authorized keys on server",
        command: "cat ~/.ssh/authorized_keys",
        description: "Shows all public keys authorized to log in as the current user.",
      },
      {
        label: "Check key fingerprint",
        command: "ssh-keygen -lf ~/.ssh/id_ed25519.pub",
        description: "Displays the fingerprint of your public key for verification.",
      },
    ],
    tags: ["ssh", "keys", "ed25519", "authentication"],
  },
  {
    id: "auto-updates",
    category: "System Maintenance",
    title: "Enable automatic security updates",
    severity: "medium",
    description:
      "Unpatched systems are the easiest targets. Automatic security updates ensure critical patches are applied without waiting for manual intervention.",
    impact:
      "Known vulnerabilities are actively exploited within hours of disclosure. Delayed patching leaves a window for attackers to compromise your systems.",
    steps: [
      "Install unattended-upgrades: sudo apt install unattended-upgrades",
      "Enable: sudo dpkg-reconfigure -plow unattended-upgrades",
      "Configure /etc/apt/apt.conf.d/50unattended-upgrades",
      "Enable security updates origin pattern",
      "Optionally enable automatic reboot for kernel updates",
      "Check logs: /var/log/unattended-upgrades/",
    ],
    commands: [
      {
        label: "Check for pending updates",
        command: "sudo apt list --upgradable 2>/dev/null | head -20",
        description: "Lists packages with available updates.",
      },
      {
        label: "View unattended-upgrades log",
        command: "sudo cat /var/log/unattended-upgrades/unattended-upgrades.log | tail -30",
        description: "Shows recent automatic update activity.",
      },
    ],
    tags: ["updates", "patching", "maintenance"],
  },

  // ─── Incident Response Plan ─────────────────────────────────────────────────

  {
    id: "ir-preparation",
    category: "Incident Response",
    title: "Phase 1: Preparation — Build your IR capability",
    severity: "critical",
    description:
      "Preparation is the foundation of effective incident response. Establish an IR team, define roles, set up communication channels, and ensure tooling is ready before an incident occurs.",
    impact:
      "Without preparation, teams waste critical time during incidents figuring out who does what, leading to slower containment and greater damage.",
    steps: [
      "Designate an Incident Commander (IC) and define the IR team roster with on-call rotation",
      "Create a secure out-of-band communication channel (e.g., dedicated Slack/Teams channel, bridge line)",
      "Document escalation paths: L1 → L2 → L3 → CISO → Legal → Executive",
      "Maintain an up-to-date asset inventory with criticality ratings",
      "Pre-authorize IR actions: network isolation, account disabling, forensic imaging",
      "Conduct tabletop exercises quarterly to validate the plan",
      "Ensure forensic tools are installed and tested: disk imaging, memory capture, log collectors",
      "Establish relationships with external parties: ISP, law enforcement, IR retainer firms",
    ],
    commands: [
      { label: "Check IR toolkit availability", command: "which tcpdump volatility dd netstat ss lsof 2>/dev/null || echo 'Install missing tools'", description: "Verify forensic tools are installed." },
      { label: "Test log collection", command: "journalctl --since '1 hour ago' | head -20", description: "Verify system logging is active." },
    ],
    references: [
      { title: "NIST SP 800-61r2: Computer Security Incident Handling Guide", url: "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final" },
    ],
    tags: ["incident-response", "preparation", "nist", "ir-plan"],
  },
  {
    id: "ir-detection",
    category: "Incident Response",
    title: "Phase 2: Detection & Analysis — Identify and assess the threat",
    severity: "critical",
    description:
      "Rapidly detect, validate, and assess the scope of a security incident. Determine if an alert is a true positive, classify its severity, and begin evidence collection.",
    impact:
      "Delayed detection allows attackers to establish persistence, move laterally, and exfiltrate data. Every minute counts.",
    steps: [
      "Triage the alert: validate it's a true positive using correlated data (logs, network, endpoint)",
      "Classify severity: Critical (active breach), High (confirmed compromise), Medium (suspicious activity), Low (policy violation)",
      "Identify affected systems, accounts, and data using SecOps dashboard filters and FlowMap",
      "Check for Indicators of Compromise (IOCs): unusual IPs, new user accounts, unexpected processes",
      "Capture volatile evidence first: running processes, network connections, memory dumps",
      "Document the timeline: when was the first indicator? What's the attack vector?",
      "Search for lateral movement: check UBA for anomalous user behavior across hosts",
      "Assign an incident ID and begin the incident log with timestamps for all actions",
    ],
    commands: [
      { label: "Check active connections", command: "ss -tunapl | grep ESTABLISHED", description: "List all established network connections." },
      { label: "List recent logins", command: "last -n 20", description: "Show recent login activity." },
      { label: "Find recently modified files", command: "find /etc /var -mmin -60 -type f 2>/dev/null | head -20", description: "Files modified in the last hour." },
      { label: "Check running processes", command: "ps auxf --sort=-%cpu | head -20", description: "Top processes by CPU usage." },
    ],
    tags: ["incident-response", "detection", "analysis", "triage", "ioc"],
  },
  {
    id: "ir-containment",
    category: "Incident Response",
    title: "Phase 3: Containment — Stop the bleeding",
    severity: "critical",
    description:
      "Contain the incident to prevent further damage. Apply short-term containment immediately, then plan long-term containment while preserving evidence for forensics.",
    impact:
      "Without containment, attackers continue to operate freely — exfiltrating data, deploying ransomware, or compromising additional systems.",
    steps: [
      "SHORT-TERM (immediate): Isolate affected systems from the network (do NOT power off — preserve memory)",
      "Block attacker IPs at the firewall/WAF using SecOps risk sources one-click commands",
      "Disable compromised user accounts and revoke active sessions/tokens",
      "Change credentials for any exposed service accounts or API keys",
      "LONG-TERM: Apply temporary firewall rules to restrict lateral movement",
      "Redirect DNS for compromised domains to a sinkhole",
      "Enable enhanced logging on all systems in the blast radius",
      "Preserve forensic images of affected systems before any remediation",
    ],
    commands: [
      { label: "Isolate host (iptables)", command: "sudo iptables -I INPUT -j DROP && sudo iptables -I OUTPUT -j DROP && sudo iptables -I INPUT -s <management_ip> -j ACCEPT && sudo iptables -I OUTPUT -d <management_ip> -j ACCEPT", description: "Network-isolate a host while keeping management access." },
      { label: "Block attacker IP", command: "sudo iptables -A INPUT -s <attacker_ip> -j DROP", description: "Block a specific attacker IP." },
      { label: "Disable user account", command: "sudo usermod -L <username> && sudo pkill -u <username>", description: "Lock account and kill all sessions." },
      { label: "Capture memory dump", command: "sudo dd if=/dev/mem of=/tmp/memdump.raw bs=1M count=512", description: "Capture system memory for forensics." },
    ],
    tags: ["incident-response", "containment", "isolation", "firewall"],
  },
  {
    id: "ir-eradication",
    category: "Incident Response",
    title: "Phase 4: Eradication — Remove the threat",
    severity: "high",
    description:
      "Eliminate the root cause of the incident. Remove malware, close vulnerabilities, and ensure the attacker has no remaining access or persistence mechanisms.",
    impact:
      "Incomplete eradication leads to re-compromise. Attackers often plant multiple backdoors — missing even one means starting over.",
    steps: [
      "Identify and remove all malware, backdoors, and unauthorized accounts",
      "Check for persistence mechanisms: cron jobs, systemd services, SSH authorized_keys, startup scripts",
      "Patch the vulnerability that was exploited as the initial attack vector",
      "Rotate ALL credentials on affected systems (not just compromised ones)",
      "Review and clean firewall rules, DNS records, and routing tables",
      "Scan all systems in the blast radius with updated antivirus/EDR signatures",
      "Verify no unauthorized SSH keys, certificates, or API tokens remain",
      "Update IDS/IPS signatures with IOCs from this incident",
    ],
    commands: [
      { label: "Find unauthorized SSH keys", command: "find / -name authorized_keys -exec echo '=== {} ===' \\; -exec cat {} \\; 2>/dev/null", description: "List all SSH authorized_keys files." },
      { label: "Check cron jobs (all users)", command: "for u in $(cut -f1 -d: /etc/passwd); do echo \"=== $u ===\"; crontab -l -u $u 2>/dev/null; done", description: "Review all user cron jobs for persistence." },
      { label: "Check systemd services", command: "systemctl list-unit-files --type=service --state=enabled | grep -v '@'", description: "List enabled services." },
      { label: "Find SUID binaries", command: "find / -perm -4000 -type f 2>/dev/null", description: "Find files with SUID bit set (potential privilege escalation)." },
    ],
    tags: ["incident-response", "eradication", "malware", "persistence", "patching"],
  },
  {
    id: "ir-recovery",
    category: "Incident Response",
    title: "Phase 5: Recovery — Restore normal operations",
    severity: "high",
    description:
      "Carefully restore affected systems to production. Validate that systems are clean, monitor closely for re-compromise, and gradually return to normal operations.",
    impact:
      "Rushing recovery without validation risks reintroducing the threat. Careful monitoring during recovery catches any missed persistence.",
    steps: [
      "Restore systems from known-good backups (verify backup integrity first)",
      "Rebuild compromised systems from scratch if backup integrity is uncertain",
      "Re-enable network connectivity in stages — most critical systems first",
      "Implement enhanced monitoring for 30 days: lower alert thresholds, increase log retention",
      "Validate system integrity: file checksums, configuration baselines, service health",
      "Re-enable user accounts one at a time with fresh credentials",
      "Run vulnerability scans to confirm patches are applied",
      "Communicate restoration status to stakeholders at regular intervals",
    ],
    commands: [
      { label: "Verify file integrity", command: "sudo debsums -c 2>/dev/null || sudo rpm -Va 2>/dev/null | head -20", description: "Check package file integrity." },
      { label: "Check listening ports", command: "ss -tlnp", description: "Verify only expected services are listening." },
      { label: "Monitor auth logs", command: "sudo tail -f /var/log/auth.log", description: "Watch authentication events in real-time." },
    ],
    tags: ["incident-response", "recovery", "restoration", "monitoring"],
  },
  {
    id: "ir-lessons-learned",
    category: "Incident Response",
    title: "Phase 6: Lessons Learned — Improve for next time",
    severity: "medium",
    description:
      "Conduct a blameless post-incident review within 72 hours. Document what happened, what worked, what didn't, and create actionable improvements to prevent recurrence.",
    impact:
      "Organizations that skip post-incident reviews repeat the same mistakes. Each incident is an opportunity to strengthen defenses.",
    steps: [
      "Schedule a post-incident review meeting within 72 hours (while details are fresh)",
      "Create a timeline of the incident from first indicator to full recovery",
      "Document: attack vector, systems affected, data exposed, business impact, response time",
      "Identify what detection worked and what was missed — update detection rules",
      "Evaluate response effectiveness: were runbooks followed? What slowed the team down?",
      "Create action items with owners and deadlines for each improvement",
      "Update the IR plan, playbooks, and runbooks based on findings",
      "Share sanitized findings with the broader team for awareness (no blame)",
    ],
    references: [
      { title: "NIST SP 800-61r2: Post-Incident Activity", url: "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final" },
    ],
    tags: ["incident-response", "post-mortem", "lessons-learned", "improvement"],
  },
  {
    id: "ir-checklist-brute-force",
    category: "Incident Response",
    title: "Runbook: SSH Brute Force Attack",
    severity: "high",
    description:
      "Step-by-step response checklist for handling an active SSH brute force attack detected by SecOps Center.",
    impact:
      "SSH brute force attacks can lead to unauthorized access if weak credentials exist. Rapid response prevents account compromise.",
    steps: [
      "Verify the alert: check SecOps dashboard for failed SSH attempts from the source IP",
      "Check UBA: is the targeted user showing anomalous behavior?",
      "Visualize: open FlowMap for the attacker IP to see all targeted hosts/users",
      "Immediate block: use the one-click fail2ban/iptables command from Risk Sources",
      "Check if any attempt succeeded: search for successful logins from the same IP",
      "If compromised: disable the user account, capture forensic evidence, follow Phase 3",
      "If not compromised: verify the account has strong credentials or key-only auth",
      "Add the IP to the permanent blocklist in Settings → IP Whitelist (as a block)",
      "Check for distributed attack: are other IPs from the same subnet also attacking?",
      "Document the incident and update firewall rules",
    ],
    commands: [
      { label: "Check failed SSH attempts", command: "journalctl -u sshd --since '1 hour ago' | grep 'Failed' | awk '{print $11}' | sort | uniq -c | sort -rn | head -10", description: "Top IPs with failed SSH attempts in the last hour." },
      { label: "Check successful logins from IP", command: "journalctl -u sshd --since '24 hours ago' | grep 'Accepted' | grep '<attacker_ip>'", description: "Check if the attacker successfully logged in." },
      { label: "Ban IP with fail2ban", command: "sudo fail2ban-client set sshd banip <attacker_ip>", description: "Immediately ban the attacker IP." },
    ],
    tags: ["incident-response", "runbook", "ssh", "brute-force", "checklist"],
  },
  {
    id: "ir-checklist-data-exfil",
    category: "Incident Response",
    title: "Runbook: Suspected Data Exfiltration",
    severity: "critical",
    description:
      "Response checklist for when unusual outbound data transfers or suspicious data access patterns are detected.",
    impact:
      "Data exfiltration can result in regulatory fines, reputational damage, and loss of intellectual property. Time-critical response is essential.",
    steps: [
      "Identify the source: which user/system is generating unusual outbound traffic?",
      "Check UBA for the user: multi-country access? Unusual volume? Off-hours activity?",
      "Capture network evidence: packet capture on the affected system",
      "Identify destination: where is data being sent? Check DNS logs for unusual domains",
      "Contain immediately: isolate the system from the network (preserve for forensics)",
      "Disable the user account and revoke all tokens/sessions",
      "Determine what data was accessed: check application logs, database audit logs",
      "Assess regulatory impact: was PII, PHI, or financial data involved?",
      "Notify legal/compliance team if regulated data is confirmed exposed",
      "Preserve all evidence with chain of custody documentation",
    ],
    commands: [
      { label: "Capture network traffic", command: "sudo tcpdump -i any -w /tmp/capture-$(date +%s).pcap -c 10000", description: "Capture 10,000 packets for analysis." },
      { label: "Check outbound connections", command: "ss -tunapl | grep ESTABLISHED | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10", description: "Top outbound connection destinations." },
      { label: "Check DNS queries", command: "sudo journalctl -u systemd-resolved --since '1 hour ago' 2>/dev/null || sudo cat /var/log/syslog | grep 'dnsmasq' | tail -30", description: "Recent DNS resolution activity." },
    ],
    tags: ["incident-response", "runbook", "data-exfiltration", "checklist", "critical"],
  },
];

export const CATEGORIES = [...new Set(SECURITY_TIPS.map((t) => t.category))];
export const ALL_TAGS = [...new Set(SECURITY_TIPS.flatMap((t) => t.tags))].sort();
