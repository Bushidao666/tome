<script lang="ts">
    import Assistant from '$components/Messages/Assistant.svelte';
    import Thought from '$components/Messages/Thought.svelte';
    import Tool from '$components/Messages/Tool.svelte';
    import User from '$components/Messages/User.svelte';
    import { Message, Setting } from '$lib/models';

    interface Props {
        message: Message;
    }

    const { message }: Props = $props();
    const showReasoning = $derived(Setting.ShowReasoning);
</script>

{#if message.role == 'user'}
    <User {message} />
{:else if message.role == 'assistant' && message.content === '' && message.toolCalls.length}
    <Tool {message} />
{:else if message.role == 'assistant'}
    {#if showReasoning && message.thought}
        <Thought thought={message.thought} />
    {/if}
    <Assistant {message} />
{/if}
