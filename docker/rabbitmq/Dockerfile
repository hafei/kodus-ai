FROM rabbitmq:3-management

# 下载并启用延迟消息插件
RUN apt-get update && apt-get install -y wget && \
    wget https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.13.0/rabbitmq_delayed_message_exchange-3.13.0.ez \
    -P /opt/rabbitmq/plugins/ && \
    rabbitmq-plugins enable rabbitmq_delayed_message_exchange
