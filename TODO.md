### Critical

- [x] Leak all organizations when user registered first time in setup wizard (or select existing).
- [x] Improve after logged in, no need to show setup wizard again, just show dashboard with default organization selected, and allow user to switch organization from the dashboard (if not select any, select the default or last used or first organization).

### Brainstorming

- [x] Add geolocation data to events based on source IP addresses and display this information on the dashboard, including a world map visualization showing the geographic distribution of security events.
- [x] Add CyberKiller view mode: A dedicated view that focuses on visualizing and analyzing attack patterns, showing the relationships between different events, sources, and targets in a more intuitive and interactive way, helping analysts to quickly identify potential attack paths and prioritize their investigations.
- [x] Add a timeline view that allows analysts to see the sequence of events leading up to and following a potential security incident, providing context and helping to identify the root cause of the issue.
- [x] Add then-and-now comparison view: A feature that allows analysts to compare current security event data with historical data to identify trends, anomalies, and changes in the threat landscape over time and visualize this comparison in a clear and intuitive way, such as side-by-side charts or a before-and-after timeline in "CyberKiller" view mode.
- Add timeline scroll to past-present on Threats Map view (overlay on world map) to see how attack patterns and sources have evolved over time, allowing analysts to identify trends and changes in the threat landscape.
- [x] Add a "Threat Hunting" section that provides tools and features for proactive threat hunting, allowing analysts to search for indicators of compromise (IOCs), create custom queries, and investigate potential threats before they become incidents.
- [x] Add mindmap or flow (using ReactFlow) view: A visual representation of the relationships between different security events, sources, and targets, allowing analysts to quickly identify potential attack paths and connections between events that may not be immediately obvious in a traditional timeline or list view.
- Add user behavior analytics (UBA) to identify anomalous activity by analyzing patterns of user behavior and flagging deviations from normal behavior that may indicate a potential security threat.
- Add a "Security Playbook" section that provides pre-defined playbooks for common attack patterns and mitigation steps, helping analysts to quickly respond to incidents and follow best practices for incident response.
- Add a "Threat Intelligence" section that integrates with external threat intelligence feeds to provide additional context and information about potential threats, such as known malicious IP addresses, domains, and attack techniques.
- Add the ability to filter the timeline by event type, source, and other criteria to help analysts focus on the most relevant information.
- Implement a machine learning-based anomaly detection system that can analyze historical event data to identify unusual patterns and flag potential threats that may not be immediately obvious through traditional rule-based detection methods.
- Implement a correlation engine that can identify related events across different sources and timeframes, helping analysts to piece together attack patterns and identify potential breaches more effectively.
- Add support for custom event types and fields, allowing users to tailor the dashboard to their specific security monitoring needs and integrate with a wider range of data sources.
- [x] Add support organization and team management features to allow multiple users to collaborate on the SOC dashboard with different roles and permissions and a custom webhook endpoint for each team to ingest their own security event data.
- Add prometheus metrics and Grafana dashboard for monitoring the performance and health of the SOC dashboard itself.
- Expose prometheus metrics endpoint for external monitoring tools to scrape and visualize the performance of the SOC dashboard and design a Grafana dashboard to display these metrics in a user-friendly way.
- Add machine learning-based anomaly detection to identify unusual patterns in security events.
- Add security playbook section with common attack patterns and mitigation steps.
- Integrate with external threat intelligence feeds to enrich event data.
- Implement user behavior analytics to identify anomalous activity.
- Add support for additional event sources (e.g., firewall logs, IDS alerts).
- Create a mobile app for on-the-go monitoring and incident response.
- Implement role-based access control (RBAC) to manage user permissions and access to different features of the dashboard.
- Implement SecOps Agent (Go-based): A lightweight agent that can be installed on servers to collect security event data and send it to the SOC dashboard in real-time, providing more comprehensive visibility into security events across the infrastructure (using a simple configuration file to specify which logs to monitor and how to parse them, and supporting common log formats like syslog, Nginx, MySQL, PostgreSQL, JSON, and CSV).
- Add ansible playbook to deploy a security monitoring and send to webhook endpoint for the SOC dashboard, making it easier for users to set up and configure their security monitoring infrastructure by one-click deployment of a pre-configured ansible playbook that sets up common security monitoring tools (e.g., fail2ban, logwatch) and configures them to send event data to the SOC dashboard's webhook endpoint.

### Key Features for the SOC Dashboard

- **Real-time Event Monitoring**: A dashboard that displays security events as they happen, allowing SOC analysts to quickly identify and respond to threats.
- **Webhook Ingestion**: An API endpoint that can receive security event data from various sources (e.g., PAM, sshd) in real-time.
- **Event Correlation**: The ability to correlate events across different sources to identify patterns and potential threats.
- **Threat Detection**: Automatically flag events that match certain criteria (e.g., failed login attempts, invalid user authentication) as potential threats.
- **Activity Timeline**: A visualization of security events over time, showing trends and spikes in activity.
- **Highest Risk Sources**: A ranked list of IP addresses or users that are generating the most security events, helping analysts prioritize their investigations.
- **Quick Mitigation**: One-click options to generate `fail2ban` or `iptables` commands to block malicious IPs directly from the dashboard.
- **Interactive Charts**: Pie charts and bar charts that break down events by type, host, source IP, and service, with the ability to click on segments to filter the event list.
- **Advanced Filtering**: A powerful search and filter system that allows analysts to quickly find specific events based on various criteria (e.g., event type, host, IP address, user, service).
- **Paginated Event Table**: A table that lists all security events with pagination, status icons, and the ability to click on an event to view more details.
- **Event Detail Drawer**: A slide-out panel that shows all the details of a specific event, including grouped sections for easier readability and a badge indicating if it's a potential threat.
- **Responsive Design**: A layout that adapts to different screen sizes, ensuring that analysts can monitor security events on both desktop and mobile devices.
- **Dark Mode**: A dark theme for the dashboard to reduce eye strain during long monitoring sessions, giving it a classic SOC aesthetic.
- **Authentication**: A secure login system to ensure that only authorized personnel can access the SOC dashboard, using email/password authentication with server-side session management.

### Branding and Identity

- **Name**: "SecOps" or "SecOps Center" — A straightforward name that clearly conveys the purpose of the dashboard.
- **Logo**: A simple shield icon with a radar or network motif, symbolizing security and monitoring.
- **Color Scheme**: Dark background with bright accent colors (e.g., red for threats, green for safe events, blue for informational events) to create a visually distinct and intuitive interface and primary color: `#7916FF` (a vibrant purple) for a modern and tech-savvy feel.
- **Iconography**: Use of clear and consistent icons for different event types, status indicators, and actions to enhance usability.
- **Typography**: Clean, modern sans-serif fonts for readability and a professional look.
- **UI Style**: A sleek, minimalist design with a focus on data visualization and ease of navigation, ensuring that analysts can quickly access the information they need without unnecessary clutter.
- **Tone and Messaging**: Clear, concise, and actionable language throughout the dashboard, with tooltips and help sections to guide users in understanding and responding to security events effectively.
- **Community Engagement**: Encourage users to contribute to the project by providing clear documentation, a contribution guide, and an active presence on platforms like GitHub and social media to foster a community around the SecOps Center.
- **Open Source**: Emphasize the open-source nature of the project, inviting collaboration and contributions from security professionals and developers to continuously improve the dashboard and adapt it to evolving security needs.
- **Licensing**: Use a permissive open-source license (e.g., MIT) to allow for wide adoption and customization by organizations of all sizes.
- **Support and Resources**: Provide comprehensive documentation, including setup guides, API references, and troubleshooting tips, to help users get the most out of the SecOps Center and ensure a smooth implementation process.
- **Future Roadmap**: Outline potential future features and improvements, such as integration with additional data sources, machine learning-based threat detection, and enhanced collaboration tools for SOC teams, to keep users informed about the ongoing development of the project.
